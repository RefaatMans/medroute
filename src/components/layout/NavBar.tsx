import { NavLink, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { APP_NAME, ROLE_LABELS } from '../../config/app';
import { useAuth } from '../../hooks/useAuth';
import { logout } from '../../services/authService';
import type { UserRole } from '../../types';

const LINKS: { to: string; label: string; roles: UserRole[] }[] = [
  { to: '/ambulance', label: 'Ambulance', roles: ['ambulance'] },
  { to: '/hospital', label: 'Hospital', roles: ['hospital', 'admin'] },
  { to: '/hospital/camera', label: 'AI Camera', roles: ['hospital', 'admin'] },
  { to: '/simulator', label: 'Simulator', roles: ['admin'] },
  { to: '/admin', label: 'Admin', roles: ['admin'] },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-3 py-2 text-sm font-medium ${isActive ? 'bg-white text-red-700' : 'hover:bg-red-600'}`;

export default function NavBar() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const links = profile ? LINKS.filter((l) => l.roles.includes(profile.role)) : [];

  return (
    <header className="bg-red-700 text-white shadow">
      <nav className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2" aria-label="Main">
        <span className="mr-4 text-lg font-bold tracking-tight">
          <span aria-hidden="true">✚ </span>
          {APP_NAME}
        </span>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end className={linkClass}>
            {l.label}
          </NavLink>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              {profile && (
                <span className="hidden text-sm sm:inline">
                  {profile.displayName} · {ROLE_LABELS[profile.role]}
                </span>
              )}
              <button type="button" onClick={handleLogout} className="rounded px-3 py-2 text-sm font-medium hover:bg-red-600">
                Log out
              </button>
            </>
          ) : (
            <>
              <NavLink to="/login" className={linkClass}>
                Log in
              </NavLink>
              <NavLink to="/register" className={linkClass}>
                Register
              </NavLink>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
