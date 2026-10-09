import { doc, getDocs, limit, query, runTransaction, serverTimestamp, Timestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import { getRequirements } from '../config/caseRules';
import { CANDIDATE_BED_LIMIT, DISPATCH_EXPIRY_BUFFER_MIN } from '../config/dispatch';
import { nextBedStatus } from '../lib/bedMachine';
import { applyStatusChange } from '../lib/bedSummary';
import type { CaseType, DispatchStatus, LatLng, Severity } from '../types';
import { UserFacingError } from './authService';
import { ambulanceDoc, bedDoc, bedsCol, dispatchDoc, dispatchesCol, hospitalDoc } from './db';

export interface CreateDispatchInput {
  ambulanceId: string;
  hospitalId: string;
  caseType: CaseType;
  severity: Severity;
  origin: LatLng;
  etaMinutes: number;
}

export type CreateDispatchFailure = 'NO_BED' | 'DIVERTING' | 'AMBULANCE_BUSY';
export type CreateDispatchResult =
  | { ok: true; dispatchId: string; bedLabel: string }
  | { ok: false; code: CreateDispatchFailure };

/** Thrown inside a transaction to abort it without retrying. */
class Abort extends Error {
  constructor(readonly code: CreateDispatchFailure | 'BED_TAKEN') {
    super(code);
  }
}

/**
 * Many ambulances may hit the same hospital document at once; each successful reservation
 * forces the others to retry, so allow more attempts than the SDK default of 5.
 */
const TX_OPTIONS = { maxAttempts: 20 };

/**
 * Reserves one specific bed for an ambulance (spec 7.2): the reservation flag.
 *
 * Web transactions can't run queries, so free beds are listed first, then each candidate is
 * claimed in its own transaction that re-reads the bed. Firestore aborts and retries a
 * transaction whose read documents changed before commit, so two ambulances can never both
 * see the same bed as `available` and reserve it.
 */
export async function createDispatch(input: CreateDispatchInput): Promise<CreateDispatchResult> {
  const { ambulanceId, hospitalId, caseType, severity, origin } = input;
  const { bedType } = getRequirements(caseType, severity);
  const etaMinutes = Math.max(1, Math.round(input.etaMinutes));

  const candidates = await getDocs(
    query(bedsCol(hospitalId), where('type', '==', bedType), where('status', '==', 'available'), limit(CANDIDATE_BED_LIMIT)),
  );
  const dispatchRef = doc(dispatchesCol());

  for (const candidate of candidates.docs) {
    try {
      const bedLabel = await runTransaction(
        db,
        async (tx) => {
          const ambulanceRef = ambulanceDoc(ambulanceId);
          const hospitalRef = hospitalDoc(hospitalId);
          const bedRef = bedDoc(hospitalId, candidate.id);
          const [ambulance, hospital, bed] = await Promise.all([
            tx.get(ambulanceRef).then((s) => s.data()),
            tx.get(hospitalRef).then((s) => s.data()),
            tx.get(bedRef).then((s) => s.data()),
          ]);
          if (!ambulance || !hospital) throw new UserFacingError('Ambulance or hospital not found.');
          if (ambulance.activeDispatchId) throw new Abort('AMBULANCE_BUSY');
          if (hospital.diverting) throw new Abort('DIVERTING');
          if (!bed || bed.status !== 'available') throw new Abort('BED_TAKEN');

          const expiresAt = Timestamp.fromMillis(Date.now() + (etaMinutes + DISPATCH_EXPIRY_BUFFER_MIN) * 60_000);
          tx.update(bedRef, { status: 'reserved', reservedByDispatchId: dispatchRef.id, updatedAt: serverTimestamp() });
          tx.update(hospitalRef, {
            bedSummary: applyStatusChange(hospital.bedSummary, bed.type, 'available', 'reserved'),
            incomingCount: hospital.incomingCount + 1,
            updatedAt: serverTimestamp(),
          });
          tx.set(dispatchRef, {
            id: dispatchRef.id,
            ambulanceId,
            ambulanceCallSign: ambulance.callSign,
            hospitalId,
            hospitalName: hospital.name,
            bedId: bed.id,
            bedLabel: bed.label,
            bedType: bed.type,
            caseType,
            severity,
            status: 'en_route',
            etaMinutes,
            origin: { lat: origin.lat, lng: origin.lng },
            createdAt: serverTimestamp(),
            expiresAt,
            acknowledgedAt: null,
            closedAt: null,
            closedReason: null,
          });
          tx.update(ambulanceRef, { status: 'en_route', activeDispatchId: dispatchRef.id });
          return bed.label;
        },
        TX_OPTIONS,
      );
      return { ok: true, dispatchId: dispatchRef.id, bedLabel };
    } catch (err) {
      if (err instanceof Abort) {
        if (err.code === 'BED_TAKEN') continue; // someone else got it first: try the next bed
        return { ok: false, code: err.code };
      }
      throw err;
    }
  }
  return { ok: false, code: 'NO_BED' };
}

type ClosedStatus = Exclude<DispatchStatus, 'en_route'>;

/**
 * Closes an en-route dispatch in one transaction: dispatch status, the reserved bed
 * (released, or occupied on arrival), the hospital's counters, and the ambulance.
 * Returns false if it was already closed (safe when two clients act at once).
 */
async function closeDispatch(dispatchId: string, status: ClosedStatus, reason: string): Promise<boolean> {
  return runTransaction(
    db,
    async (tx) => {
      const dRef = dispatchDoc(dispatchId);
      const dispatch = (await tx.get(dRef)).data();
      if (!dispatch) throw new UserFacingError('Trip not found.');
      if (dispatch.status !== 'en_route') return false;

      const bedRef = bedDoc(dispatch.hospitalId, dispatch.bedId);
      const hospitalRef = hospitalDoc(dispatch.hospitalId);
      const ambulanceRef = ambulanceDoc(dispatch.ambulanceId);
      const [bed, hospital, ambulance] = await Promise.all([
        tx.get(bedRef).then((s) => s.data()),
        tx.get(hospitalRef).then((s) => s.data()),
        tx.get(ambulanceRef).then((s) => s.data()),
      ]);

      // Only touch the bed if it is still held for this dispatch.
      if (bed && hospital && bed.status === 'reserved' && bed.reservedByDispatchId === dispatchId) {
        const t = nextBedStatus('reserved', status === 'arrived' ? 'AMBULANCE_ARRIVED' : 'RELEASE');
        if (t.ok) {
          tx.update(bedRef, { status: t.to, reservedByDispatchId: null, updatedAt: serverTimestamp() });
          tx.update(hospitalRef, {
            bedSummary: applyStatusChange(hospital.bedSummary, bed.type, 'reserved', t.to),
            incomingCount: Math.max(0, hospital.incomingCount - 1),
            updatedAt: serverTimestamp(),
          });
        }
      } else if (hospital) {
        tx.update(hospitalRef, { incomingCount: Math.max(0, hospital.incomingCount - 1), updatedAt: serverTimestamp() });
      }

      tx.update(dRef, { status, closedAt: serverTimestamp(), closedReason: reason });
      if (ambulance?.activeDispatchId === dispatchId) {
        tx.update(ambulanceRef, { status: 'idle', activeDispatchId: null });
      }
      return true;
    },
    TX_OPTIONS,
  );
}

const withReason = (prefix: string, reason?: string) => (reason?.trim() ? `${prefix}: ${reason.trim()}` : prefix);

export function cancelDispatch(dispatchId: string, reason?: string): Promise<boolean> {
  return closeDispatch(dispatchId, 'cancelled', withReason('Cancelled', reason));
}

/** Reason text used when an admin cancels a trip, so the paramedic can be told. */
export const FORCE_CANCEL_REASON = 'Force-cancelled by admin';

export function forceCancelDispatch(dispatchId: string): Promise<boolean> {
  return closeDispatch(dispatchId, 'cancelled', FORCE_CANCEL_REASON);
}

export function markArrived(dispatchId: string): Promise<boolean> {
  return closeDispatch(dispatchId, 'arrived', 'Ambulance marked arrival');
}

export function expireDispatch(dispatchId: string): Promise<boolean> {
  return closeDispatch(dispatchId, 'expired', 'Reservation expired: the ambulance did not arrive in time');
}

export async function acknowledgeDispatch(dispatchId: string): Promise<void> {
  await updateDoc(dispatchDoc(dispatchId), { acknowledgedAt: serverTimestamp() });
}

/**
 * Expires every en-route dispatch past its `expiresAt` (spec 7.3). Idempotent, so several
 * open tabs can run it. Pass a hospital ID to sweep only that hospital (hospital staff may
 * only modify their own hospital). Returns how many were expired.
 */
export async function releaseExpiredDispatches(hospitalId?: string | null): Promise<number> {
  // Equality-only filters need no composite index; the time check is done here.
  const filters = [where('status', '==', 'en_route'), ...(hospitalId ? [where('hospitalId', '==', hospitalId)] : [])];
  const open = await getDocs(query(dispatchesCol(), ...filters));
  const now = Date.now();
  const expired = open.docs.map((d) => d.data()).filter((d) => d.expiresAt.toMillis() < now);
  const results = await Promise.allSettled(expired.map((d) => expireDispatch(d.id)));
  return results.filter((r) => r.status === 'fulfilled' && r.value).length;
}
