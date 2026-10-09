import { useHospitals } from '../hooks/useHospitals';

/** Hospital dropdown for admin pages. */
export default function HospitalPicker({ value, onChange, id = 'hospital-picker' }: { value: string | null; onChange: (id: string) => void; id?: string }) {
  const hospitals = useHospitals();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-sm font-medium text-slate-700">
        Hospital
      </label>
      <select
        id={id}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
      >
        {hospitals.data.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </div>
  );
}
