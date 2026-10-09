import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import FormField, { inputClass, primaryButtonClass } from '../components/FormField';
import { ROLE_HOME, ROLE_LABELS } from '../config/app';
import { useAmbulances } from '../hooks/useAmbulances';
import { useAuth } from '../hooks/useAuth';
import { useHospitals } from '../hooks/useHospitals';
import { errorMessage, register } from '../services/authService';
import { USER_ROLES, type UserRole } from '../types';

export default function RegisterPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const hospitals = useHospitals();
  const ambulances = useAmbulances();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('ambulance');
  const [hospitalId, setHospitalId] = useState('');
  const [ambulanceId, setAmbulanceId] = useState('');
  const [adminCode, setAdminCode] = useState('');
  const [busy, setBusy] = useState(false);

  if (profile && !busy) return <Navigate to={ROLE_HOME[profile.role]} replace />;

  const realAmbulances = ambulances.data.filter((a) => !a.simulated);
  const noDemoData = !hospitals.loading && hospitals.data.length === 0;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ email, password, displayName, role, hospitalId, ambulanceId, adminCode });
      toast.success('Account created');
      navigate(ROLE_HOME[role], { replace: true });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold">Create an account</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <FormField label="Name" htmlFor="name">
          <input id="name" autoComplete="name" required className={inputClass} value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        </FormField>
        <FormField label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="password" hint="At least 6 characters.">
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={6}
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>

        <fieldset>
          <legend className="block text-sm font-medium text-slate-800">Role</legend>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {USER_ROLES.map((r) => (
              <label
                key={r}
                className={`cursor-pointer rounded-md border px-2 py-3 text-center text-sm font-medium focus-within:ring-2 focus-within:ring-blue-600 ${
                  role === r ? 'border-red-700 bg-red-50 text-red-800' : 'border-slate-300 bg-white'
                }`}
              >
                <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="sr-only" />
                {ROLE_LABELS[r]}
              </label>
            ))}
          </div>
        </fieldset>

        {role !== 'admin' && noDemoData && (
          <p role="alert" className="rounded-md bg-amber-100 p-3 text-sm text-amber-900">
            No demo data yet. An admin must register first and click <strong>Seed demo data</strong>.
          </p>
        )}

        {role === 'hospital' && (
          <FormField label="Your hospital" htmlFor="hospital">
            <select id="hospital" required className={inputClass} value={hospitalId} onChange={(e) => setHospitalId(e.target.value)}>
              <option value="">{hospitals.loading ? 'Loading…' : 'Choose a hospital'}</option>
              {hospitals.data.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {role === 'ambulance' && (
          <FormField label="Your ambulance" htmlFor="ambulance">
            <select id="ambulance" required className={inputClass} value={ambulanceId} onChange={(e) => setAmbulanceId(e.target.value)}>
              <option value="">{ambulances.loading ? 'Loading…' : 'Choose an ambulance'}</option>
              {realAmbulances.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.callSign}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {role === 'admin' && (
          <FormField label="Admin code" htmlFor="adminCode" hint="The VITE_ADMIN_CODE value from your .env file.">
            <input id="adminCode" type="password" required className={inputClass} value={adminCode} onChange={(e) => setAdminCode(e.target.value)} />
          </FormField>
        )}

        {(hospitals.error || ambulances.error) && (
          <p role="alert" className="text-sm text-red-700">
            Could not load hospitals/ambulances: {(hospitals.error ?? ambulances.error)!.message}
          </p>
        )}

        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        Already registered?{' '}
        <Link to="/login" className="font-medium text-red-700 underline">
          Log in
        </Link>
      </p>
    </div>
  );
}
