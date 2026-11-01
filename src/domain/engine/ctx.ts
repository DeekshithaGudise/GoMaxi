import type { AppState, ActivityEvent, DispatchDecision, ID } from '../types';

type Coll = 'users' | 'commuters' | 'drivers' | 'operators' | 'vehicles' | 'stations' | 'hotspots' | 'anchorRoutes' | 'bookings' | 'groups' | 'trips' | 'payments' | 'boardingRecords' | 'alerts' | 'earnings' | 'schedules';

export class EngineError extends Error { constructor(public code: string, message: string) { super(message); } }

export function nextId(state: AppState, key: string, prefix: string): ID {
  const n = (state.counters[key] ?? 1) + 1;
  state.counters = { ...state.counters, [key]: n };
  return `${prefix}-${n}`;
}

/** Copy-on-write entity update: replaces the entity and the collection map so React selectors see new references. */
export function put<K extends Coll>(state: AppState, coll: K, entity: AppState[K][string]) {
  const id = (entity as unknown as { id?: string; vehicleId?: string }).id ?? (entity as { vehicleId?: string }).vehicleId!;
  (state as unknown as Record<string, Record<string, unknown>>)[coll] = { ...(state[coll] as Record<string, unknown>), [id]: entity };
  return entity;
}
export function patch<K extends Coll>(state: AppState, coll: K, id: ID, changes: Partial<AppState[K][string]>) {
  const cur = state[coll][id];
  if (!cur) throw new EngineError('not_found', `${coll}/${id} not found`);
  return put(state, coll, { ...cur, ...changes } as AppState[K][string]);
}
export function remove<K extends Coll>(state: AppState, coll: K, id: ID) {
  const next = { ...(state[coll] as Record<string, unknown>) };
  delete next[id];
  (state as unknown as Record<string, Record<string, unknown>>)[coll] = next;
}

export function emit(state: AppState, category: ActivityEvent['category'], message: string, refs?: ActivityEvent['refs'], simulated = false) {
  const ev: ActivityEvent = { id: nextId(state, 'event', 'EVT'), at: state.clock.simTime, category, message, refs, simulated };
  state.activity = [...state.activity.slice(-599), ev];
  return ev;
}

export function logDecision(state: AppState, d: Omit<DispatchDecision, 'id' | 'at'>) {
  const dec: DispatchDecision = { id: nextId(state, 'decision', 'DEC'), at: state.clock.simTime, ...d };
  state.dispatchLog = [...state.dispatchLog.slice(-599), dec];
  return dec;
}

export const now = (state: AppState) => state.clock.simTime;
export const vals = <T,>(m: Record<string, T>): T[] => Object.values(m);
export const ACTIVE_BOOKING = new Set(['confirmed', 'assigned', 'boarded']);
