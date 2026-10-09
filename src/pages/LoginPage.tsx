import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import FormField, { inputClass, primaryButtonClass } from '../components/FormField';
import { APP_NAME, APP_TAGLINE, ROLE_HOME } from '../config/app';
import { useAuth } from '../hooks/useAuth';
import { errorMessage, login } from '../services/authService';

export default function LoginPage() {
  const { profile } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  // Already signed in (or just signed in): go to this role's home page.
  if (profile) return <Navigate to={ROLE_HOME[profile.role]} replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success('Logged in');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm px-4 py-10">
      <h1 className="text-2xl font-bold">Log in to {APP_NAME}</h1>
      <p className="mt-1 text-slate-600">{APP_TAGLINE}</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <FormField label="Email" htmlFor="email">
          <input id="email" type="email" autoComplete="email" required className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
        </FormField>
        <FormField label="Password" htmlFor="password">
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </FormField>
        <button type="submit" disabled={busy} className={primaryButtonClass}>
          {busy ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-600">
        No account?{' '}
        <Link to="/register" className="font-medium text-red-700 underline">
          Register
        </Link>
      </p>
    </div>
  );
}
