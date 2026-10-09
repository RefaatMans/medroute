import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { ROLE_HOME } from '../../config/app';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../services/authService';
import type { UserRole } from '../../types';
import Spinner from '../Spinner';

interface Props {
  roles: UserRole[];
  children: ReactNode;
}

/** Renders `children` only for signed-in users with one of `roles`; redirects everyone else. */
export default function ProtectedRoute({ roles, children }: Props) {
  const { user, profile, loading, error } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-4 py-10 text-center">
        {error ? (
          <p className="text-red-700">Could not load your profile: {error.message}</p>
        ) : (
          <Spinner label="Setting up your account…" />
        )}
        <p className="mt-4 text-sm text-slate-600">
          If this doesn't go away, your account has no profile.{' '}
          <button type="button" className="font-medium text-red-700 underline" onClick={() => logout()}>
            Log out
          </button>{' '}
          and register again.
        </p>
      </div>
    );
  }

  if (!roles.includes(profile.role)) return <Navigate to={ROLE_HOME[profile.role]} replace />;
  return <>{children}</>;
}
