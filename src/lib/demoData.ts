import { BED_LABEL_PREFIX, BED_WARDS } from '../config/labels';
import { BED_TYPES, type BedStatus, type BedSummary, type BedType, type Capability, type LatLng } from '../types';
import { summarizeBeds } from './bedSummary';

/**
 * Demo data from spec section 11, generated deterministically (fixed pseudo-random seed)
 * so every seed / reset produces the same beds. Pure: `services/seed.ts` writes it.
 */

export interface HospitalSeed {
  id: string;
  name: string;
  address: string;
  phone: string;
  location: LatLng;
  capabilities: Capability[];
  beds: Record<BedType, number>;
  erComfortCapacity: number;
  erWaitingCount: number;
}

export interface SeedBed {
  id: string;
  label: string;
  type: BedType;
  ward: string;
  status: BedStatus;
  sensorOccupied: boolean;
}

export interface SeedAmbulance {
  id: string;
  callSign: string;
  location: LatLng | null;
  simulated: boolean;
}

export const SEED_HOSPITALS: HospitalSeed[] = [
  {
    id: 'h-cedar',
    name: 'Cedar General Hospital',
    address: 'Hamra Street, Beirut',
    phone: '+961 1 555 0101',
    location: { lat: 33.896, lng: 35.482 },
    capabilities: ['general', 'cardiac', 'trauma', 'stroke'],
    beds: { general: 20, icu: 6, pediatric: 0, maternity: 0 },
    erComfortCapacity: 25,
    erWaitingCount: 8,
  },
  {
    id: 'h-olive',
    name: 'Olive Tree Medical Center',
    address: 'Achrafieh, Beirut',
    phone: '+961 1 555 0102',
    location: { lat: 33.888, lng: 35.52 },
    capabilities: ['general', 'cardiac', 'pediatric', 'maternity'],
    beds: { general: 15, icu: 4, pediatric: 6, maternity: 5 },
    erComfortCapacity: 20,
    erWaitingCount: 22,
  },
  {
    id: 'h-harbor',
    name: 'Harbor Emergency Hospital',
    address: 'Port District, Beirut',
    phone: '+961 1 555 0103',
    location: { lat: 33.899, lng: 35.515 },
    capabilities: ['general', 'trauma', 'burns'],
    beds: { general: 12, icu: 5, pediatric: 0, maternity: 0 },
    erComfortCapacity: 15,
    erWaitingCount: 4,
  },
  {
    id: 'h-hills',
    name: 'Hills University Hospital',
    address: 'Hazmieh, Mount Lebanon',
    phone: '+961 5 555 0104',
    location: { lat: 33.856, lng: 35.54 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric'],
    beds: { general: 25, icu: 8, pediatric: 6, maternity: 0 },
    erComfortCapacity: 30,
    erWaitingCount: 12,
  },
  {
    id: 'h-valley',
    name: 'Valley Community Hospital',
    address: 'Baabda, Mount Lebanon',
    phone: '+961 5 555 0105',
    location: { lat: 33.834, lng: 35.544 },
    capabilities: ['general', 'maternity'],
    beds: { general: 10, icu: 2, pediatric: 0, maternity: 6 },
    erComfortCapacity: 12,
    erWaitingCount: 3,
  },
  {
    id: 'h-coast',
    name: 'Coastline Medical Center',
    address: 'Jounieh, Keserwan',
    phone: '+961 9 555 0106',
    location: { lat: 33.98, lng: 35.62 },
    capabilities: ['general', 'cardiac', 'burns', 'pediatric'],
    beds: { general: 18, icu: 5, pediatric: 4, maternity: 0 },
    erComfortCapacity: 20,
    erWaitingCount: 9,
  },
];

export const SEED_AMBULANCES: SeedAmbulance[] = [
  ...[1, 2, 3].map((n) => ({
    id: `amb-0${n}`,
    callSign: `AMB-0${n}`,
    location: null,
    simulated: false,
  })),
  ...Array.from({ length: 10 }, (_, i) => {
    const n = String(i + 1).padStart(2, '0');
    return {
      id: `sim-${n}`,
      callSign: `SIM-${n}`,
      // Parked in a small grid around Downtown Beirut so they're visible on the admin map.
      location: { lat: 33.8955 + (i % 5) * 0.002, lng: 35.505 + Math.floor(i / 5) * 0.003 },
      simulated: true,
    };
  }),
];

/** Small deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const OCCUPIED_SHARE = 0.7;
const CLEANING_SHARE = 0.1;

/**
 * ~70 % occupied, ~10 % cleaning, the rest available, shuffled with a per-hospital seed.
 * Every bed type keeps at least one available bed so each case type is routable at start.
 */
export function buildSeedBeds(h: HospitalSeed): SeedBed[] {
  const rand = mulberry32(hashString(h.id));
  const beds: SeedBed[] = [];
  for (const type of BED_TYPES) {
    const n = h.beds[type];
    if (n === 0) continue;
    const occupied = Math.floor(n * OCCUPIED_SHARE);
    const cleaning = Math.min(Math.round(n * CLEANING_SHARE), n - occupied - 1);
    const statuses: BedStatus[] = [
      ...Array<BedStatus>(occupied).fill('occupied'),
      ...Array<BedStatus>(cleaning).fill('cleaning'),
      ...Array<BedStatus>(n - occupied - cleaning).fill('available'),
    ];
    // Fisher–Yates shuffle
    for (let i = statuses.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
    }
    const prefix = BED_LABEL_PREFIX[type];
    statuses.forEach((status, i) =>
      beds.push({
        id: `${prefix.toLowerCase()}-${i + 1}`,
        label: `${prefix}-${i + 1}`,
        type,
        ward: BED_WARDS[type],
        status,
        sensorOccupied: status === 'occupied',
      }),
    );
  }
  return beds;
}

export interface DemoHospital {
  seed: HospitalSeed;
  beds: SeedBed[];
  bedSummary: BedSummary;
}

export function buildDemoHospitals(): DemoHospital[] {
  return SEED_HOSPITALS.map((seed) => {
    const beds = buildSeedBeds(seed);
    return { seed, beds, bedSummary: summarizeBeds(beds) };
  });
}
