import { createContext, useContext, useSyncExternalStore, useCallback, useMemo } from 'react';
import type { AppState } from '../types';
import { Store } from './store';
import type { Command, CommandResult } from '../engine/commands';

export const StoreContext = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('StoreContext missing');
  return s;
}

/** Select a slice of state; component re-renders when the selected value changes (Object.is). */
export function useAppState<T>(selector: (s: AppState) => T): T {
  const store = useStore();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

/** Memoised derived data: recomputed only when the store commits (every tick ~2Hz) — cheap for our data volumes. */
export function useDerived<T>(compute: (s: AppState) => T): T {
  const state = useAppState((s) => s);
  return useMemo(() => compute(state), [state]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function useDispatch() {
  const store = useStore();
  return useCallback((cmd: Command): Promise<CommandResult> => store.dispatch(cmd), [store]);
}

export const useClock = () => useAppState((s) => s.clock);
export const useNow = () => useAppState((s) => s.clock.simTime);
