import { useSession } from '@/app/session';
import { useDerived } from '@/domain/store/hooks';
import { driverStats } from '@/domain/engine/analytics';

export function useDriver() {
  const { session } = useSession();
  const driverId = session!.userId;
  const stats = useDerived((s) => driverStats(s, driverId));
  return { driverId, ...stats };
}
