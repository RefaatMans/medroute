import type { ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import NavBar from './components/layout/NavBar';
import ProtectedRoute from './components/layout/ProtectedRoute';
import SetupBanner from './components/layout/SetupBanner';
import Spinner from './components/Spinner';
import { DEMO_NOTICE, ROLE_HOME } from './config/app';
import { useAuth } from './hooks/useAuth';
import AdminPage from './pages/AdminPage';
import AmbulancePage from './pages/AmbulancePage';
import CameraPage from './pages/CameraPage';
import HospitalDashboard from './pages/HospitalDashboard';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import SimulatorPage from './pages/SimulatorPage';
import type { UserRole } from './types';

/** `/` sends signed-in users to their role's page and everyone else to login. */
function HomeRedirect() {
  const { profile, loading } = useAuth();
  if (loading) return <Spinner />;
  return <Navigate to={profile ? ROLE_HOME[profile.role] : '/login'} replace />;
}

const guard = (roles: UserRole[], page: ReactNode) => <ProtectedRoute roles={roles}>{page}</ProtectedRoute>;

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <NavBar />
      <SetupBanner />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/ambulance" element={guard(['ambulance'], <AmbulancePage />)} />
          <Route path="/hospital" element={guard(['hospital', 'admin'], <HospitalDashboard />)} />
          <Route path="/hospital/camera" element={guard(['hospital', 'admin'], <CameraPage />)} />
          <Route path="/simulator" element={guard(['admin'], <SimulatorPage />)} />
          <Route path="/admin" element={guard(['admin'], <AdminPage />)} />
          <Route path="*" element={<HomeRedirect />} />
        </Routes>
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-2 text-center text-xs text-slate-600">
        <span aria-hidden="true">ⓘ </span>
        {DEMO_NOTICE}
      </footer>
      <Toaster position="top-center" toastOptions={{ duration: 4000 }} />
    </div>
  );
}
