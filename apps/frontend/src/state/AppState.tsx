import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { api, setAuthContext } from "../api/client";
import { useRefreshAll } from "../api/hooks";
import type { SimResult, UserProfile } from "../api/types";

export interface Toast {
  id: number;
  tone: "danger" | "warn" | "ok" | "info";
  title: string;
  body?: string;
  href?: string;
}

export const DEFAULT_USERS: UserProfile[] = [
  {
    id: "USR-ADMIN",
    username: "admin",
    name: "Alex Vance (SuperAdmin)",
    email: "admin@agrichain.sentinel",
    role: "ADMIN",
    participant_id: null,
  },
  {
    id: "USR-AUDITOR",
    username: "auditor",
    name: "Dr. Sunita Sharma (Auditor)",
    email: "auditor@agrichain.sentinel",
    role: "AUDITOR",
    participant_id: null,
  },
  {
    id: "USR-FARMER-1",
    username: "farmer_ramesh",
    name: "Ramesh Patil (Kisan Farm)",
    email: "ramesh@kisanfarm.in",
    role: "FARMER",
    participant_id: "F-001",
  },
  {
    id: "USR-COOP-1",
    username: "coop_solapur",
    name: "Solapur Agro-Cooperative",
    email: "procurement@solapuragro.org",
    role: "COOP",
    participant_id: "C-001",
  },
  {
    id: "USR-PROC-1",
    username: "processor_agropack",
    name: "AgroPack Foods Pvt Ltd",
    email: "ops@agropack.com",
    role: "PROCESSOR",
    participant_id: "P-001",
  },
  {
    id: "USR-DIST-1",
    username: "distributor_coldtrans",
    name: "ColdTrans Logistics",
    email: "fleet@coldtrans.in",
    role: "DISTRIBUTOR",
    participant_id: "D-001",
  },
  {
    id: "USR-RET-1",
    username: "retailer_bigbasket",
    name: "FreshMart Retail Organics",
    email: "inward@freshmart.in",
    role: "RETAILER",
    participant_id: "R-001",
  },
];

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
  activeUser: UserProfile | null;
  setActiveUser: (u: UserProfile | null) => void;
  loginAsDemo: (u: UserProfile) => void;
  logout: () => void;
  isAuthenticated: boolean;
  portalMode: "admin" | "participant";
  setPortalMode: (mode: "admin" | "participant") => void;
}

const Ctx = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [running, setRunning] = useState(false);
  const [speedMs, setSpeedMs] = useState(2000);
  const [busy, setBusy] = useState(false);
  const [feed, setFeed] = useState<SimResult[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const [activeUser, setActiveUserState] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem("agrichain_user");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.role) {
          setAuthContext(parsed.role, parsed.participant_id);
          return parsed;
        }
      }
    } catch {
      /* fallback */
    }
    setAuthContext("", null);
    return null;
  });

  const isAuthenticated = !!activeUser;

  const [portalMode, setPortalModeState] = useState<"admin" | "participant">(() => {
    if (!activeUser) return "participant";
    return activeUser.role === "ADMIN" || activeUser.role === "AUDITOR" ? "admin" : "participant";
  });

  const refresh = useRefreshAll();
  const inFlight = useRef(false);
  const toastId = useRef(0);

  const setActiveUser = useCallback(
    (u: UserProfile | null) => {
      setActiveUserState(u);
      if (u) {
        setAuthContext(u.role, u.participant_id);
        try {
          localStorage.setItem("agrichain_user", JSON.stringify(u));
        } catch {
          /* storage unavailable */
        }
        setPortalModeState(u.role === "ADMIN" || u.role === "AUDITOR" ? "admin" : "participant");
      } else {
        setAuthContext("", null);
        try {
          localStorage.removeItem("agrichain_user");
        } catch {
          /* ignore */
        }
        setPortalModeState("participant");
      }
      refresh();
    },
    [refresh],
  );

  const setPortalMode = useCallback((mode: "admin" | "participant") => {
    setPortalModeState(mode);
  }, []);

  const loginAsDemo = useCallback(
    (u: UserProfile) => {
      setActiveUser(u);
    },
    [setActiveUser],
  );

  const logout = useCallback(() => {
    try {
      localStorage.removeItem("agrichain_user");
    } catch {
      /* ignore */
    }
    setActiveUserState(null);
    setAuthContext("", null);
    setPortalModeState("participant");
    refresh();
  }, [refresh]);

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
              href: "/admin/quarantine",
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

  const inject = useCallback((type: string) => step(type), [step]);

  useEffect(() => {
    if (!running) return;
    const t = window.setInterval(step, speedMs);
    return () => window.clearInterval(t);
  }, [running, speedMs, step]);

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
        activeUser,
        setActiveUser,
        loginAsDemo,
        logout,
        isAuthenticated,
        portalMode,
        setPortalMode,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useApp(): AppState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp must be inside AppStateProvider");
  return v;
}
