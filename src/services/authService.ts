import {
  createUserWithEmailAndPassword,
  deleteUser,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { FirebaseError } from 'firebase/app';
import { serverTimestamp, setDoc } from 'firebase/firestore';
import { ADMIN_CODE, auth } from '../firebase';
import type { UserRole } from '../types';
import { userDoc } from './db';

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  hospitalId?: string;
  ambulanceId?: string;
  adminCode?: string;
}

/** Error with a message that's safe and useful to show in a toast. */
export class UserFacingError extends Error {}

export async function register(input: RegisterInput): Promise<void> {
  const { email, password, displayName, role } = input;
  if (!displayName.trim()) throw new UserFacingError('Please enter your name.');
  if (role === 'hospital' && !input.hospitalId) throw new UserFacingError('Please choose your hospital.');
  if (role === 'ambulance' && !input.ambulanceId) throw new UserFacingError('Please choose your ambulance.');
  if (role === 'admin' && (!ADMIN_CODE || input.adminCode !== ADMIN_CODE)) {
    throw new UserFacingError('Wrong admin code.');
  }

  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password).catch(rethrowFriendly);
  try {
    await updateProfile(cred.user, { displayName: displayName.trim() });
    await setDoc(userDoc(cred.user.uid), {
      id: cred.user.uid,
      displayName: displayName.trim(),
      email: email.trim(),
      role,
      hospitalId: role === 'hospital' ? input.hospitalId! : null,
      ambulanceId: role === 'ambulance' ? input.ambulanceId! : null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    // Don't leave a half-created account (login works but no profile/role).
    await deleteUser(cred.user).catch(() => undefined);
    rethrowFriendly(err);
  }
}

export async function login(email: string, password: string): Promise<void> {
  await signInWithEmailAndPassword(auth, email.trim(), password).catch(rethrowFriendly);
}

export async function logout(): Promise<void> {
  await signOut(auth);
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address is not valid.',
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in.',
  'auth/weak-password': 'Password must be at least 6 characters.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/invalid-login-credentials': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email/password sign-in is not enabled in the Firebase console.',
  'permission-denied': 'Permission denied. Have the Firestore security rules been published? (see README)',
};

function rethrowFriendly(err: unknown): never {
  if (err instanceof FirebaseError && MESSAGES[err.code]) throw new UserFacingError(MESSAGES[err.code]);
  throw err;
}

/** Turns any thrown value into a short message for a toast. */
export function errorMessage(err: unknown): string {
  if (err instanceof UserFacingError) return err.message;
  if (err instanceof FirebaseError) return MESSAGES[err.code] ?? `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}
