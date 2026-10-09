import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useBeep } from '../hooks/useBeep';
import { useIncomingDispatches } from '../hooks/useDispatches';
import IncomingDispatchRow from './IncomingDispatchRow';
import Spinner from './Spinner';

/** How long a newly arrived dispatch stays highlighted. */
const NEW_HIGHLIGHT_MS = 15_000;

/** Live list of ambulances heading to this hospital; beeps and highlights new ones. */
export default function IncomingPanel({ hospitalId, now }: { hospitalId: string; now: Date }) {
  const incoming = useIncomingDispatches(hospitalId);
  const beep = useBeep();
  const seen = useRef<Set<string> | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    seen.current = null; // switching hospital: don't beep for its existing list
  }, [hospitalId]);

  useEffect(() => {
    if (incoming.loading) return;
    const ids = incoming.data.map((d) => d.id);
    if (seen.current === null) {
      seen.current = new Set(ids); // first load: existing trips are not "new"
      return;
    }
    const fresh = ids.filter((id) => !seen.current!.has(id));
    ids.forEach((id) => seen.current!.add(id));
    if (fresh.length === 0) return;

    const beeped = beep();
    const d = incoming.data.find((x) => x.id === fresh[0])!;
    toast(`Incoming: ${d.ambulanceCallSign} → bed ${d.bedLabel}${beeped ? '' : ' (click anywhere once to enable sound)'}`, { icon: '🚑' });
    setNewIds((s) => new Set([...s, ...fresh]));
    // Not cleared on re-render: later live updates must not cancel the un-highlight.
    window.setTimeout(() => setNewIds((s) => new Set([...s].filter((id) => !fresh.includes(id)))), NEW_HIGHLIGHT_MS);
  }, [incoming.data, incoming.loading, beep]);

  return (
    <section aria-labelledby="incoming-heading" className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 id="incoming-heading" className="mb-3 text-lg font-semibold">
        Incoming ambulances <span className="text-slate-500">({incoming.data.length})</span>
      </h2>
      {incoming.loading ? (
        <Spinner />
      ) : incoming.error ? (
        <p className="text-red-700">Could not load incoming ambulances: {incoming.error.message}</p>
      ) : incoming.data.length === 0 ? (
        <p className="text-sm text-slate-600">No ambulances on the way.</p>
      ) : (
        <ul className="space-y-2" aria-live="polite">
          {incoming.data.map((d) => (
            <IncomingDispatchRow key={d.id} dispatch={d} now={now} isNew={newIds.has(d.id)} />
          ))}
        </ul>
      )}
    </section>
  );
}
