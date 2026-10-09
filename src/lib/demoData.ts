import { BED_LABEL_PREFIX, BED_WARDS } from '../config/labels';
import { BED_TYPES, type BedStatus, type BedSummary, type BedType, type Capability, type LatLng } from '../types';
import { summarizeBeds } from './bedSummary';

/**
 * Demo data (real Beirut hospitals, simulated capacity), generated deterministically (fixed
 * pseudo-random seed) so every seed / reset produces the same beds. Pure: `services/seed.ts` writes it.
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

/**
 * Real hospitals in Greater Beirut. Names and locations are real (OpenStreetMap building
 * centroids, cross-checked with Wikidata, checked 2026-10-10). Everything else here — bed counts,
 * specialties, ER numbers — is SIMULATED for the demo and says nothing about the real hospital.
 * Phone numbers are deliberately left empty so a demo tap on "Call" can't ring a real switchboard.
 */
export const SEED_HOSPITALS: HospitalSeed[] = [
  {
    id: 'h-aubmc',
    name: 'American University of Beirut Medical Center',
    address: 'Cairo St, Ras Beirut',
    phone: '',
    location: { lat: 33.898, lng: 35.4859 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 30, icu: 12, pediatric: 8, maternity: 6 },
    erComfortCapacity: 35,
    erWaitingCount: 28,
  },
  {
    id: 'h-cmc',
    name: 'Clemenceau Medical Center',
    address: 'Clemenceau St, Beirut',
    phone: '',
    location: { lat: 33.8975, lng: 35.49 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma'],
    beds: { general: 18, icu: 8, pediatric: 0, maternity: 0 },
    erComfortCapacity: 20,
    erWaitingCount: 6,
  },
  {
    id: 'h-rhuh',
    name: 'Rafik Hariri University Hospital',
    address: 'Bir Hassan / Jnah, Beirut',
    phone: '',
    location: { lat: 33.8636, lng: 35.4913 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'burns', 'pediatric', 'maternity'],
    beds: { general: 30, icu: 10, pediatric: 8, maternity: 6 },
    erComfortCapacity: 35,
    erWaitingCount: 30,
  },
  {
    id: 'h-sahel',
    name: 'Sahel General Hospital',
    address: 'Airport Rd, Ghobeiry',
    phone: '',
    location: { lat: 33.858, lng: 35.5037 },
    capabilities: ['general', 'cardiac', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 18, icu: 5, pediatric: 5, maternity: 5 },
    erComfortCapacity: 20,
    erWaitingCount: 18,
  },
  {
    id: 'h-rasoul',
    name: 'Al Rasoul Al Aazam Hospital',
    address: 'Airport Rd, Bourj el-Barajneh',
    phone: '',
    location: { lat: 33.8431, lng: 35.4987 },
    capabilities: ['general', 'cardiac', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 20, icu: 6, pediatric: 5, maternity: 5 },
    erComfortCapacity: 25,
    erWaitingCount: 22,
  },
  {
    id: 'h-makassed',
    name: 'Makassed General Hospital',
    address: 'Tariq el Jdideh, Beirut',
    phone: '',
    location: { lat: 33.8753, lng: 35.5041 },
    capabilities: ['general', 'cardiac', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 20, icu: 6, pediatric: 5, maternity: 5 },
    erComfortCapacity: 25,
    erWaitingCount: 12,
  },
  {
    id: 'h-hdf',
    name: 'Hôtel-Dieu de France',
    address: 'Alfred Naccache St, Achrafieh',
    phone: '',
    location: { lat: 33.8819, lng: 35.519 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 25, icu: 10, pediatric: 6, maternity: 6 },
    erComfortCapacity: 30,
    erWaitingCount: 14,
  },
  {
    id: 'h-rizk',
    name: 'LAU Medical Center – Rizk Hospital',
    address: 'Zahar St, Achrafieh',
    phone: '',
    location: { lat: 33.8853, lng: 35.5151 },
    capabilities: ['general', 'cardiac', 'stroke', 'pediatric', 'maternity'],
    beds: { general: 15, icu: 6, pediatric: 4, maternity: 6 },
    erComfortCapacity: 18,
    erWaitingCount: 9,
  },
  {
    id: 'h-stgeorge',
    name: 'Saint George Hospital University Medical Center',
    address: 'Youssef Sursock St, Rmeil, Achrafieh',
    phone: '',
    location: { lat: 33.894, lng: 35.5239 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 25, icu: 10, pediatric: 6, maternity: 5 },
    erComfortCapacity: 30,
    erWaitingCount: 35,
  },
  {
    id: 'h-geitaoui',
    name: 'Lebanese Hospital Geitaoui UMC',
    address: 'Geitawi, Achrafieh',
    phone: '',
    location: { lat: 33.894, lng: 35.5309 },
    capabilities: ['general', 'cardiac', 'trauma', 'burns', 'pediatric', 'maternity'],
    beds: { general: 18, icu: 6, pediatric: 4, maternity: 4 },
    erComfortCapacity: 20,
    erWaitingCount: 8,
  },
  {
    id: 'h-mlh',
    name: 'Mount Lebanon Hospital',
    address: 'Camille Chamoun Blvd, Hazmieh',
    phone: '',
    location: { lat: 33.8602, lng: 35.5281 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 20, icu: 8, pediatric: 5, maternity: 5 },
    erComfortCapacity: 25,
    erWaitingCount: 10,
  },
  {
    id: 'h-bellevue',
    name: 'Bellevue Medical Center',
    address: 'Mansourieh, Metn',
    phone: '',
    location: { lat: 33.8483, lng: 35.5595 },
    capabilities: ['general', 'cardiac', 'stroke', 'trauma', 'pediatric', 'maternity'],
    beds: { general: 18, icu: 6, pediatric: 4, maternity: 4 },
    erComfortCapacity: 20,
    erWaitingCount: 5,
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
