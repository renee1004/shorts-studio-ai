"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from "react";
import { allCheckableIds, allTaskIds, prepItems, steps } from "@/lib/content";

const STORAGE_KEY = "shorts-factory.progress.v1";

type Snapshot = { ids: readonly string[]; blocked: boolean };

const emptySnapshot: Snapshot = { ids: [], blocked: false };

let snapshot: Snapshot = emptySnapshot;
let loaded = false;
const listeners = new Set<() => void>();

function parse(raw: string | null): string[] {
  if (!raw) return [];
  const value: unknown = JSON.parse(raw);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function load() {
  try {
    snapshot = { ids: parse(window.localStorage.getItem(STORAGE_KEY)), blocked: false };
  } catch {
    snapshot = { ids: [], blocked: true };
  }
}

function ensureLoaded() {
  if (loaded) return;
  loaded = true;
  load();
}

function emit() {
  for (const listener of listeners) listener();
}

function commit(ids: readonly string[]) {
  let blocked = snapshot.blocked;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    blocked = true;
  }
  snapshot = { ids, blocked };
  emit();
}

function subscribe(listener: () => void) {
  ensureLoaded();
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      load();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Snapshot {
  ensureLoaded();
  return snapshot;
}

function getServerSnapshot(): Snapshot {
  return emptySnapshot;
}

const subscribeToNothing = () => () => {};

type ProgressState = {
  ready: boolean;
  doneIds: readonly string[];
  toggle: (id: string) => void;
  isDone: (id: string) => boolean;
  replace: (ids: string[]) => void;
  reset: () => void;
  stepProgress: (slug: string) => { done: number; total: number; percent: number };
  overall: { done: number; total: number; percent: number };
  prepDone: number;
  storageBlocked: boolean;
};

const ProgressContext = createContext<ProgressState | null>(null);

export function ProgressProvider({ children }: { children: React.ReactNode }) {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const done = useMemo(() => new Set(store.ids), [store]);

  const toggle = useCallback((id: string) => {
    const next = new Set(snapshot.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    commit([...next]);
  }, []);

  const replace = useCallback((ids: string[]) => {
    const known = new Set(allCheckableIds);
    commit([...new Set(ids.filter((id) => known.has(id)))]);
  }, []);

  const reset = useCallback(() => commit([]), []);

  const value = useMemo<ProgressState>(() => {
    const doneTasks = allTaskIds.filter((id) => done.has(id)).length;

    return {
      ready,
      doneIds: store.ids,
      toggle,
      replace,
      reset,
      isDone: (id: string) => done.has(id),
      stepProgress: (slug: string) => {
        const step = steps.find((s) => s.slug === slug);
        const total = step?.tasks.length ?? 0;
        const doneCount = step?.tasks.filter((task) => done.has(task.id)).length ?? 0;
        return {
          done: doneCount,
          total,
          percent: total === 0 ? 0 : Math.round((doneCount / total) * 100),
        };
      },
      overall: {
        done: doneTasks,
        total: allTaskIds.length,
        percent: Math.round((doneTasks / allTaskIds.length) * 100),
      },
      prepDone: prepItems.filter((item) => done.has(item.id)).length,
      storageBlocked: store.blocked,
    };
  }, [done, ready, replace, reset, store.blocked, store.ids, toggle]);

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

export function useProgress() {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error("useProgress는 ProgressProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}
