import type { LatLng } from '../types';

/** Quick location presets for the paramedic page (laptop demos without GPS). */
export const DEMO_LOCATIONS: { name: string; location: LatLng }[] = [
  { name: 'Hamra', location: { lat: 33.8968, lng: 35.4823 } },
  { name: 'Achrafieh', location: { lat: 33.8869, lng: 35.52 } },
  { name: 'Baabda', location: { lat: 33.8339, lng: 35.5442 } },
  { name: 'Hazmieh', location: { lat: 33.853, lng: 35.539 } },
  { name: 'Jounieh', location: { lat: 33.9808, lng: 35.6178 } },
  { name: 'Downtown Beirut', location: { lat: 33.8955, lng: 35.505 } },
];

/** Default map centre (Greater Beirut). */
export const MAP_CENTER: LatLng = { lat: 33.872, lng: 35.515 };
export const MAP_ZOOM = 12;
