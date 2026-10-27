import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import { useRefreshAll } from "../api/hooks";
import type { SimResult } from "../api/types";

export interface Toast {
  id: number;
  tone: "danger" | "warn" | "ok" | "info";
  title: string;
  body?: string;
  href?: string;
}

interface AppState {
  running: boolean;
  setRunning: (v: boolean) => void;
  speedMs: number;
  setSpeedMs: (v: number) => void;
  inject: (type: string) => Promise<void>;
  busy: boolean;
  feed: SimResult[];
  toasts: Toast[];
  pushToast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
  lastError: string | null;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [speedMs, setSpeedMs] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<SimResult[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);
  const refresh = useRefreshAll();
  const inFlight = useRef(false);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const pushToast = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++toastId.current;
      setToasts((list) => [{ ...t, id }, ...list].slice(0, 4));
      window.setTimeout(() => dismissToast(id), 6500);
    },
    [dismissToast],
  );

  const step = useCallback(
    async (inject?: string) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setBusy(true);
      try {
        const n = inject ? 1 : Math.random() < 0.35 ? 2 : 1;
        const res = await api.post<{ results: SimResult[] }>("/sim/step", { n, inject: inject ?? null });
        setFeed((f) => [...res.results.reverse(), ...f].slice(0, 40));
        for (const r of res.results) {
          if (r.decision === "QUARANTINED")
            pushToast({
              tone: "danger",
              title: `Quarantined: ${r.pred_label}`,
              body: `${r.tx_id} · risk ${(r.risk * 100).toFixed(0)}% — held for auditor review`,
              href: "/quarantine",
            });
          else if (r.decision === "FLAGGED" && r.injected)
            pushToast({
              tone: "warn",
              title: `Flagged: ${r.pred_label}`,
              body: `${r.tx_id} committed with a flag`,
            });
          else if (r.injected && r.decision === "CLEAR")
            pushToast({
              tone: "info",
              title: "Injected fraud slipped through",
              body: `${r.sim_label} · ${r.tx_id}`,
            });
        }
        const sealed = res.results.flatMap((r) => r.sealed_blocks);
        if (sealed.length && !inject)
          pushToast({
            tone: "ok",
            title: `Block #${sealed[sealed.length - 1]} mined`,
            body: "Proof-of-work found",
          });
        setLastError(null);
        refresh();
      } catch (e) {
        setLastError((e as Error).message);
        setRunning(false);
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [pushToast, refresh],
  );

  useEffect(() => {
    if (!running) return;
    step();
    const id = window.setInterval(() => step(), speedMs);
    return () => window.clearInterval(id);
  }, [running, speedMs, step]);

  const inject = useCallback((type: string) => step(type), [step]);

  return (
    <Ctx.Provider
      value={{
        running,
        setRunning,
        speedMs,
        setSpeedMs,
        inject,
        busy,
        feed,
        toasts,
        pushToast,
        dismissToast,
        lastError,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside provider");
  return v;
}
