import {
  collection,
  doc,
  type DocumentData,
  type FirestoreDataConverter,
  type QueryDocumentSnapshot,
  type SnapshotOptions,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Ambulance, Bed, Dispatch, ErReading, Hospital, UserProfile } from '../types';

/**
 * Typed converters: reads come back as `{ id, ...data }`. Pending server timestamps are
 * estimated locally so freshly written docs never show `null` times in the UI.
 */
function converter<T extends { id: string }>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value) {
      const { id: _id, ...rest } = value as Record<string, unknown>;
      return rest as DocumentData;
    },
    fromFirestore(snap: QueryDocumentSnapshot, options?: SnapshotOptions) {
      return { id: snap.id, ...snap.data({ ...options, serverTimestamps: 'estimate' }) } as T;
    },
  };
}

const hospitalConverter = converter<Hospital>();
const bedConverter = converter<Bed>();
const erReadingConverter = converter<ErReading>();
const ambulanceConverter = converter<Ambulance>();
const dispatchConverter = converter<Dispatch>();
const userConverter = converter<UserProfile>();

export const COLLECTIONS = {
  hospitals: 'hospitals',
  beds: 'beds',
  erReadings: 'erReadings',
  ambulances: 'ambulances',
  dispatches: 'dispatches',
  users: 'users',
} as const;

// Typed references (for reads). Services use the same refs for writes.
export const hospitalsCol = () => collection(db, COLLECTIONS.hospitals).withConverter(hospitalConverter);
export const hospitalDoc = (hid: string) => doc(db, COLLECTIONS.hospitals, hid).withConverter(hospitalConverter);
export const bedsCol = (hid: string) =>
  collection(db, COLLECTIONS.hospitals, hid, COLLECTIONS.beds).withConverter(bedConverter);
export const bedDoc = (hid: string, bedId: string) =>
  doc(db, COLLECTIONS.hospitals, hid, COLLECTIONS.beds, bedId).withConverter(bedConverter);
export const erReadingsCol = (hid: string) =>
  collection(db, COLLECTIONS.hospitals, hid, COLLECTIONS.erReadings).withConverter(erReadingConverter);
export const ambulancesCol = () => collection(db, COLLECTIONS.ambulances).withConverter(ambulanceConverter);
export const ambulanceDoc = (aid: string) => doc(db, COLLECTIONS.ambulances, aid).withConverter(ambulanceConverter);
export const dispatchesCol = () => collection(db, COLLECTIONS.dispatches).withConverter(dispatchConverter);
export const dispatchDoc = (did: string) => doc(db, COLLECTIONS.dispatches, did).withConverter(dispatchConverter);
export const userDoc = (uid: string) => doc(db, COLLECTIONS.users, uid).withConverter(userConverter);
