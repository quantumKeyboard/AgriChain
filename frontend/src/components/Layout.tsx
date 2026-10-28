import {
  Bell,
  Boxes,
  BrainCircuit,
  ChevronDown,
  FlaskConical,
  Home,
  Network,
  Route,
  ShieldAlert,
  Syringe,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useMeta, useSummary } from "../api/hooks";
import { useApp } from "../state/AppState";
import { SunMark } from "./RiskSun";
import { Toggle } from "./ui";

const NAV = [
  { to: "/", label: "Dashboard", Icon: Home },
  { to: "/check", label: "Check", Icon: FlaskConical },
  { to: "/quarantine", label: "Quarantine", Icon: ShieldAlert },
  { to: "/ledger", label: "Ledger", Icon: Boxes },
  { to: "/trace", label: "Trace", Icon: Route },
  { to: "/network", label: "Network", Icon: Network },
  { to: "/model", label: "Model", Icon: BrainCircuit },
];

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1440px] px-4 pb-16 pt-5 md:px-8">
      <TopNav />
      <main className="mt-8">{children}</main>
      <Toasts />
    </div>
  );
}

function TopNav() {
  const { data: summary } = useSummary();
  const open = summary?.open_quarantine ?? 0;
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2.5" aria-label="AgriChain Sentinel home">
          <span className="spin-slow inline-flex">
            <SunMark size={34} />
          </span>
          <span className="hidden leading-tight lg:block">
            <span className="block text-sm font-semibold tracking-wide text-ink">AgriChain</span>
            <span className="block text-[11px] tracking-[0.2em] text-gold">SENTINEL</span>
          </span>
        </Link>
        <nav className="pill flex items-center gap-1 border border-line bg-panel p-1.5" aria-label="Main">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                `pill flex h-9 items-center gap-2 transition ${
                  isActive
                    ? "bg-gold px-3.5 text-gold-ink"
                    : "w-9 justify-center text-ink-2 hover:bg-panel-3 hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={17} aria-hidden />
                  {isActive ? (
                    <span className="text-xs font-semibold">{label}</span>
                  ) : (
                    <span className="sr-only">{label}</span>
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <SimulatorPill />

      <div className="flex items-center gap-2">
        <Link
          to="/quarantine"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-line bg-panel text-ink-2 hover:text-ink"
          aria-label={`${open} transactions awaiting review`}
          title="Quarantine queue"
        >
          <Bell size={17} />
          {open > 0 && (
            <span className="tnum absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-quar px-1 text-[10px] font-bold text-white">
              {open}
            </span>
          )}
        </Link>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-gold to-[#a8761c] text-xs font-bold text-gold-ink"
          title="Signed in as Auditor (demo)"
        >
          AU
        </div>
      </div>
    </header>
  );
}

function SimulatorPill() {
  const { running, setRunning, speedMs, setSpeedMs, inject, busy, lastError } = useApp();
  const { data: meta } = useMeta();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div
      ref={ref}
      className="pill relative flex items-center gap-3 border border-line bg-panel py-1.5 pl-4 pr-1.5"
    >
      <span className={`h-2 w-2 rounded-full ${running ? "live-dot bg-gold" : "bg-muted"}`} aria-hidden />
      <Toggle on={running} onChange={setRunning} label="Live simulator" />
      <span className="text-xs font-semibold text-ink">{running ? "Live stream" : "Simulator"}</span>
      <select
        aria-label="Simulator speed"
        value={speedMs}
        onChange={(e) => setSpeedMs(Number(e.target.value))}
        className="!w-auto !rounded-full !py-1 !pl-2 !pr-1 text-xs"
      >
        <option value={3500}>Slow</option>
        <option value={2000}>Normal</option>
        <option value={900}>Fast</option>
      </select>
      <button
        onClick={() => setMenu((m) => !m)}
        disabled={busy && !running}
        className="btn-gold flex items-center gap-1.5 px-3.5 py-2 text-xs"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <Syringe size={14} /> Inject fraud <ChevronDown size={13} />
      </button>
      {menu && (
        <div
          role="menu"
          className="slide-in absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-3xl border border-line bg-panel-2 p-2 shadow-2xl"
        >
          <p className="px-3 pb-1 pt-2 text-[11px] uppercase tracking-wider text-muted">
            Send one fraudulent transaction
          </p>
          {meta?.fraud_types.map((f) => (
            <button
              key={f.type}
              role="menuitem"
              onClick={async () => {
                setMenu(false);
                await inject(f.type);
              }}
              className="flex w-full items-center justify-between rounded-2xl px-3 py-2.5 text-left text-sm text-ink-2 hover:bg-panel-3 hover:text-ink"
            >
              {f.label}
              <span className="text-[10px] text-muted">{FRAUD_HINT[f.type]}</span>
            </button>
          ))}
          <button
            onClick={() => {
              setMenu(false);
              navigate("/check");
            }}
            className="mt-1 w-full rounded-2xl border border-dashed border-line px-3 py-2 text-xs text-muted hover:text-ink"
          >
            Or craft one by hand on the Check page →
          </button>
        </div>
      )}
      {lastError && (
        <span className="absolute left-0 top-[calc(100%+6px)] text-[11px] text-quar-ink" role="alert">
          {lastError}
        </span>
      )}
    </div>
  );
}

const FRAUD_HINT: Record<string, string> = {
  price_manipulation: "price ±40%+",
  phantom_quantity: "impossible yield",
  organic_label_fraud: "no certificate",
  cold_chain_concealed: "hidden heat breach",
  circular_trading: "A→B→C→A",
  duplicate_invoice: "re-submitted bill",
  forged_signature: "wrong signer key",
};

function Toasts() {
  const { toasts, dismissToast } = useApp();
  const navigate = useNavigate();
  const tone = {
    danger: "border-quar/60",
    warn: "border-flag/60",
    ok: "border-clear/60",
    info: "border-line",
  } as const;
  const dot = { danger: "bg-quar", warn: "bg-flag", ok: "bg-clear", info: "bg-muted" } as const;
  return (
    <div
      className="pointer-events-none fixed right-4 top-20 z-50 flex w-80 flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`slide-in pointer-events-auto rounded-2xl border bg-panel-2/95 p-3.5 shadow-2xl backdrop-blur ${tone[t.tone]}`}
        >
          <div className="flex items-start gap-2.5">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[t.tone]}`} aria-hidden />
            <button
              className="min-w-0 flex-1 text-left"
              onClick={() => t.href && navigate(t.href)}
              disabled={!t.href}
            >
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 truncate text-xs text-muted">{t.body}</p>}
            </button>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss"
              className="text-muted hover:text-ink"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
