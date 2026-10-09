import { getDocs, runTransaction, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { BED_EVENT_LABELS, BED_STATUS_LABELS } from '../config/labels';
import { completesTrip, nextBedStatus } from '../lib/bedMachine';
import { applyStatusChange, summarizeBeds } from '../lib/bedSummary';
import type { BedEvent, BedStatus } from '../types';
import { UserFacingError } from './authService';
import { ambulanceDoc, bedDoc, bedsCol, dispatchDoc, hospitalDoc } from './db';

export interface BedEventResult {
  changed: boolean;
  from: BedStatus;
  to: BedStatus;
  /** Set when the event closed an ambulance trip as `arrived`. */
  completedDispatchId: string | null;
}

/** Why a dispatch was closed when the patient reached the bed. */
const ARRIVAL_REASONS: Partial<Record<BedEvent, string>> = {
  SENSOR_OCCUPIED: 'Patient detected in bed by sensor',
  STAFF_PATIENT_ADMITTED: 'Patient admitted by hospital staff',
  AMBULANCE_ARRIVED: 'Ambulance marked arrival',
};

/**
 * Applies one lifecycle event to a bed in a single Firestore transaction (spec 7.1):
 * bed status, the hospital's cached `bedSummary`, and, if a reserved bed just received its
 * patient, the linked dispatch, `incomingCount` and the ambulance, all change together or not at all.
 */
export async function applyBedEvent(
  hospitalId: string,
  bedId: string,
  event: BedEvent,
  opts: { dispatchId?: string } = {},
): Promise<BedEventResult> {
  return runTransaction(db, async (tx) => {
    const bedRef = bedDoc(hospitalId, bedId);
    const hospitalRef = hospitalDoc(hospitalId);
    const [bedSnap, hospitalSnap] = await Promise.all([tx.get(bedRef), tx.get(hospitalRef)]);
    const bed = bedSnap.data();
    const hospital = hospitalSnap.data();
    if (!bed || !hospital) throw new UserFacingError('Bed or hospital not found. Was the demo data seeded?');

    const result = nextBedStatus(bed.status, event);
    if (!result.ok) {
      throw new UserFacingError(
        `INVALID_TRANSITION: can't "${BED_EVENT_LABELS[event]}" on ${bed.label} while it is ${BED_STATUS_LABELS[bed.status].toLowerCase()}.`,
      );
    }

    const isSensor = event === 'SENSOR_OCCUPIED' || event === 'SENSOR_EMPTY';
    const sensorFields = isSensor ? { sensorOccupied: event === 'SENSOR_OCCUPIED', lastSensorAt: serverTimestamp() } : {};

    if (!result.changed) {
      // Status unchanged, but still record the raw sensor reading.
      if (isSensor) tx.update(bedRef, sensorFields);
      return { changed: false, from: bed.status, to: bed.status, completedDispatchId: null };
    }

    // --- All reads must happen before any write in a Firestore transaction. ---
    let completedDispatchId: string | null = null;
    let ambulanceToFree: string | null = null;
    if (completesTrip(bed.status, event) && bed.reservedByDispatchId) {
      const dispatch = (await tx.get(dispatchDoc(bed.reservedByDispatchId))).data();
      if (dispatch?.status === 'en_route') {
        completedDispatchId = dispatch.id;
        const ambulance = (await tx.get(ambulanceDoc(dispatch.ambulanceId))).data();
        if (ambulance?.activeDispatchId === dispatch.id) ambulanceToFree = ambulance.id;
      }
    }

    // --- Writes ---
    const leavingReservation = bed.status === 'reserved';
    tx.update(bedRef, {
      status: result.to,
      updatedAt: serverTimestamp(),
      ...sensorFields,
      ...(event === 'RESERVE' ? { reservedByDispatchId: opts.dispatchId ?? null } : {}),
      ...(leavingReservation ? { reservedByDispatchId: null } : {}),
    });

    tx.update(hospitalRef, {
      bedSummary: applyStatusChange(hospital.bedSummary, bed.type, bed.status, result.to),
      ...(completedDispatchId ? { incomingCount: Math.max(0, hospital.incomingCount - 1) } : {}),
      updatedAt: serverTimestamp(),
    });

    if (completedDispatchId) {
      tx.update(dispatchDoc(completedDispatchId), {
        status: 'arrived',
        closedAt: serverTimestamp(),
        closedReason: ARRIVAL_REASONS[event] ?? 'Arrived',
      });
    }
    if (ambulanceToFree) {
      tx.update(ambulanceDoc(ambulanceToFree), { status: 'idle', activeDispatchId: null });
    }

    return { changed: true, from: bed.status, to: result.to, completedDispatchId };
  });
}

/** What a real pressure sensor (or the simulator) calls with each reading. */
export function applySensorReading(hospitalId: string, bedId: string, occupied: boolean): Promise<BedEventResult> {
  return applyBedEvent(hospitalId, bedId, occupied ? 'SENSOR_OCCUPIED' : 'SENSOR_EMPTY');
}

/** Admin repair tool: rebuilds `bedSummary` from the actual bed documents. */
export async function recomputeBedSummary(hospitalId: string): Promise<void> {
  const beds = await getDocs(bedsCol(hospitalId));
  await updateDoc(hospitalDoc(hospitalId), {
    bedSummary: summarizeBeds(beds.docs.map((d) => d.data())),
    updatedAt: serverTimestamp(),
  });
}
