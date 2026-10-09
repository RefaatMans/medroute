import { isFirebaseConfigured } from '../../firebase';

/** Shown until `.env` has Firebase values, so a fresh checkout explains itself. */
export default function SetupBanner() {
  if (isFirebaseConfigured) return null;
  return (
    <div role="alert" className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      <strong>Setup needed:</strong> Firebase is not configured. Copy <code>.env.example</code> to <code>.env</code>,
      fill in your project values (see README), and restart <code>npm run dev</code>.
    </div>
  );
}
