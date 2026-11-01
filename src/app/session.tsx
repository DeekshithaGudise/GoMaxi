import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Role } from '@/domain/types';

export interface Session { userId: string; role: Role }
interface Ctx { session: Session | null; login: (s: Session) => void; logout: () => void }
const SessionContext = createContext<Ctx | null>(null);
const KEY = 'gomaxi.session';

/** Session lives in sessionStorage so each browser tab can be a different role (commuter / driver / admin side by side). */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => { try { const raw = sessionStorage.getItem(KEY); return raw ? (JSON.parse(raw) as Session) : null; } catch { return null; } });
  const login = useCallback((s: Session) => { setSession(s); try { sessionStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ } }, []);
  const logout = useCallback(() => { setSession(null); try { sessionStorage.removeItem(KEY); } catch { /* ignore */ } }, []);
  const value = useMemo(() => ({ session, login, logout }), [session, login, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession() { const c = useContext(SessionContext); if (!c) throw new Error('SessionProvider missing'); return c; }
