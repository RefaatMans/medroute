/** Product name shown in the UI. Rename the app here only. */
export const APP_NAME = 'MedRoute';
export const APP_TAGLINE = 'Every ambulance to the right hospital, fastest.';

/** Shown on every page: the hospitals are real, their capacity is not. */
export const DEMO_NOTICE =
  'Demo: hospital names and locations are real; beds, ER crowding and ambulance trips are simulated and do not reflect the real hospitals.';

/** Where each role lands after logging in. */
export const ROLE_HOME = {
  ambulance: '/ambulance',
  hospital: '/hospital',
  admin: '/admin',
} as const;

export const ROLE_LABELS = {
  ambulance: 'Paramedic',
  hospital: 'Hospital staff',
  admin: 'Admin',
} as const;
