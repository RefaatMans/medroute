import { useSearchParams } from 'react-router-dom';
import { SEED_HOSPITALS } from '../lib/demoData';
import { useAuth } from './useAuth';

/**
 * Which hospital a page is about. Hospital staff are locked to their own hospital;
 * admins pick one, kept in the URL (`?h=h-aubmc`) so links and reloads keep it.
 */
export function useSelectedHospitalId(): { hospitalId: string | null; canChoose: boolean; choose: (id: string) => void } {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();

  if (profile?.role === 'hospital') {
    return { hospitalId: profile.hospitalId, canChoose: false, choose: () => undefined };
  }
  return {
    hospitalId: params.get('h') ?? SEED_HOSPITALS[0].id,
    canChoose: true,
    choose: (id) => setParams({ h: id }, { replace: true }),
  };
}
