import type { AppState } from '../types';
import { createInitialState, SEED_VERSION, STATE_VERSION } from './initialState';
import { execute, type Command, type CommandResult } from '../engine/commands';
import { tick } from '../engine/tick';

const STORAGE_KEY = 'gomaxi.state.v1';
const CHANNEL = 'gomaxi.sync.v1';
const TICK_MS = 500;
const PERSIST_MS = 2000;

type Listener = () => void;

/**
 * Store = the prototype's "backend". Exactly one browser tab is the LEADER (elected with the Web Locks API):
 * it owns the engine, ticks the simulated clock and persists to localStorage. Other tabs are FOLLOWERS: they
 * forward commands to the leader over a BroadcastChannel and render the state snapshots the leader broadcasts.
 * This mirrors a client/server split (commands ≈ HTTP endpoints, snapshots ≈ realtime channel) so swapping in
 * a real server (Supabase/Postgres) means replacing this class, not the apps.
 */
export class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private channel?: BroadcastChannel;
  private isLeader = false;
  private pending = new Map<string, (r: CommandResult) => void>();
  private tickTimer?: number;
  private persistTimer?: number;
  private lastTick = 0;
  private dirty = false;
  private seq = 0;
  readonly tabId = Math.random().toString(36).slice(2, 8);
  leaderKnown = false;

  constructor(initial?: AppState) {
    this.state = initial ?? this.load() ?? createInitialState();
    if (typeof window !== 'undefined') this.boot();
  }

  // ---------- public API ----------
  getState = () => this.state;
  subscribe = (l: Listener) => { this.listeners.add(l); return () => { this.listeners.delete(l); }; };
  get leader() { return this.isLeader; }

  /** Dispatch a command. Resolves with the engine's result (locally if leader, via the leader tab otherwise). */
  dispatch(cmd: Command): Promise<CommandResult> {
    if (this.isLeader || !this.channel || !this.leaderKnown) return Promise.resolve(this.apply(cmd));
    return new Promise((resolve) => {
      const id = `${this.tabId}-${++this.seq}`;
      const timeout = window.setTimeout(() => { this.pending.delete(id); resolve(this.apply(cmd)); }, 1500);
      this.pending.set(id, (r) => { window.clearTimeout(timeout); resolve(r); });
      this.channel!.postMessage({ kind: 'command', id, cmd, from: this.tabId });
    });
  }

  /** Synchronous apply — used by tests and by the leader. */
  apply(cmd: Command): CommandResult {
    const res = execute(this.state, cmd);
    this.commit();
    return res;
  }

  /** Advance simulated time (tests): runs the engine in ≤15 sim-second steps like the real tick loop. */
  advance(realMs: number) {
    let simMs = realMs * this.state.clock.speed;
    const step = 15_000;
    while (simMs > 0) { const d = Math.min(step, simMs); tick(this.state, d / this.state.clock.speed); simMs -= d; }
    this.commit();
  }

  // ---------- internals ----------
  private commit() {
    this.state = { ...this.state };
    this.dirty = true;
    for (const l of this.listeners) l();
    if (this.isLeader && this.channel) this.channel.postMessage({ kind: 'snapshot', state: this.state, from: this.tabId });
  }

  private load(): AppState | undefined {
    try {
      if (typeof localStorage === 'undefined') return undefined;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return undefined;
      const parsed = JSON.parse(raw) as AppState;
      if (parsed.version !== STATE_VERSION || parsed.seedVersion !== SEED_VERSION) return undefined;
      return parsed;
    } catch { return undefined; }
  }

  private persist() {
    if (!this.dirty || !this.isLeader) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state)); this.dirty = false; } catch { /* quota or private mode: ignore */ }
  }

  private boot() {
    try { this.channel = new BroadcastChannel(CHANNEL); } catch { this.channel = undefined; }
    if (this.channel) {
      this.channel.onmessage = (ev: MessageEvent) => {
        const msg = ev.data as { kind: string; id?: string; cmd?: Command; state?: AppState; result?: CommandResult; from: string };
        if (msg.from === this.tabId) return;
        if (msg.kind === 'snapshot' && !this.isLeader && msg.state) { this.state = msg.state; this.leaderKnown = true; for (const l of this.listeners) l(); }
        else if (msg.kind === 'command' && this.isLeader && msg.cmd) { const result = this.apply(msg.cmd); this.channel!.postMessage({ kind: 'result', id: msg.id, result, from: this.tabId }); }
        else if (msg.kind === 'result' && msg.id && this.pending.has(msg.id)) { this.pending.get(msg.id)!(msg.result!); this.pending.delete(msg.id); }
        else if (msg.kind === 'hello' && this.isLeader) this.channel!.postMessage({ kind: 'snapshot', state: this.state, from: this.tabId });
      };
      this.channel.postMessage({ kind: 'hello', from: this.tabId });
    }
    const becomeLeader = () => {
      this.isLeader = true; this.leaderKnown = true;
      const latest = this.load(); if (latest && latest.clock.simTime >= this.state.clock.simTime) this.state = latest;
      this.lastTick = performance.now();
      this.tickTimer = window.setInterval(() => { const n = performance.now(); const dt = n - this.lastTick; this.lastTick = n; tick(this.state, dt); this.commit(); }, TICK_MS);
      this.persistTimer = window.setInterval(() => this.persist(), PERSIST_MS);
      window.addEventListener('beforeunload', () => { this.dirty = true; this.persist(); });
      for (const l of this.listeners) l();
    };
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (locks) {
      locks.request('gomaxi-leader', () => new Promise<void>(() => { becomeLeader(); }));
      // If no leader answers within 400 ms we may be the only tab waiting on the lock; snapshot arrives otherwise.
      window.setTimeout(() => { if (!this.isLeader && !this.leaderKnown) { /* leader exists but hasn't answered; keep waiting for snapshot */ } }, 400);
    } else becomeLeader();
  }

  destroy() { if (this.tickTimer) window.clearInterval(this.tickTimer); if (this.persistTimer) window.clearInterval(this.persistTimer); this.channel?.close(); }
}

export function hardReset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
