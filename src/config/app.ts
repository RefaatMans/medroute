/** Product name shown in the UI. Rename the app here only. */
export const APP_NAME = 'MedRoute';
export const APP_TAGLINE = 'Every ambulance to the right hospital, fastest.';

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
