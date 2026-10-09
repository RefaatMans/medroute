import type { ReactNode } from 'react';

export const inputClass =
  'mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-3 text-base shadow-sm focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600';

export const primaryButtonClass =
  'w-full rounded-md bg-red-700 px-4 py-3 text-base font-semibold text-white shadow hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50';

export default function FormField({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
