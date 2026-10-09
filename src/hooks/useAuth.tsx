import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { onSnapshot } from 'firebase/firestore';
import { auth } from '../firebase';
import { userDoc } from '../services/db';
import type { UserProfile } from '../types';

interface AuthState {
  /** Firebase Auth user, or null when signed out. */
  user: User | null;
  /** The `users/{uid}` document; null when signed out or not created yet. */
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}

const AuthContext = createContext<AuthState>({ user: null, profile: null, loading: true, error: null });

/** Holds one auth + profile listener for the whole app. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, profile: null, loading: true, error: null });

  useEffect(() => {
    let unsubProfile: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      unsubProfile?.();
      unsubProfile = undefined;
      if (!user) {
        setState({ user: null, profile: null, loading: false, error: null });
        return;
      }
      setState({ user, profile: null, loading: true, error: null });
      unsubProfile = onSnapshot(
        userDoc(user.uid),
        (snap) => setState({ user, profile: snap.data() ?? null, loading: false, error: null }),
        (error) => setState({ user, profile: null, loading: false, error }),
      );
    });
    return () => {
      unsubProfile?.();
      unsubAuth();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
