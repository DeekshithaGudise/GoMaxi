import { useSession } from '@/app/session';
import { useAppState } from '@/domain/store/hooks';
import { ACTIVE_BOOKING } from '@/domain/engine/ctx';

export function useCommuter() {
  const { session } = useSession();
  const userId = session!.userId;
  const user = useAppState((s) => s.users[userId]);
  const commuter = useAppState((s) => s.commuters[userId]);
  const bookings = useAppState((s) => s.bookings);
  const mine = Object.values(bookings).filter((b) => b.commuterId === userId).sort((a, b) => b.createdAt - a.createdAt);
  const active = mine.find((b) => ACTIVE_BOOKING.has(b.status));
  return { userId, user, commuter, mine, active };
}
