import { useClerk } from "@clerk/clerk-react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Boxes,
  BrainCircuit,
  Building2,
  ChevronDown,
  Home,
  KeyRound,
  Layers,
  LogOut,
  Network,
  Route,
  ShieldAlert,
  ShieldCheck,
  Syringe,
  Truck,
  Users,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMeta } from "../api/hooks";
import { useApp } from "../state/AppState";
import { SunMark } from "./RiskSun";
import { Toggle } from "./ui";
import { NotificationCenter } from "./NotificationCenter";

const ADMIN_NAV = [
  { to: "/admin", label: "Dashboard", Icon: Home, end: true },
  { to: "/admin/overview", label: "Pipeline", Icon: Layers },
  { to: "/admin/lifecycle", label: "Lifecycle Explorer", Icon: Route },
  { to: "/admin/transactions", label: "Transactions", Icon: ArrowRightLeft },
  { to: "/admin/fraud", label: "Fraud Center", Icon: ShieldAlert },
  { to: "/admin/quarantine", label: "Quarantine", Icon: AlertTriangle },
  { to: "/admin/ledger", label: "Ledger", Icon: Boxes },
  { to: "/admin/network", label: "Registry", Icon: Network },
  { to: "/admin/model", label: "AI Models", Icon: BrainCircuit },
];

const PARTICIPANT_NAV = [
  { to: "/portal", label: "Workspace", Icon: Home, end: true },
  { to: "/portal/batches", label: "My Batches", Icon: Boxes },
  { to: "/portal/transfers", label: "Transfers & Inward", Icon: Truck },
  { to: "/portal/identity", label: "Crypto Identity", Icon: ShieldCheck },
];

export function Layout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";

  return (
    <div className="mx-auto max-w-[1480px] px-4 pb-16 pt-4 md:px-8">
      {!isAuthPage && <TopNav />}
      <main className={isAuthPage ? "" : "mt-6"}>{children}</main>
      <Toasts />
    </div>
  );
}

function TopNav() {
  const { portalMode, setPortalMode, activeUser, logout } = useApp();
  const clerk = useClerk();
  const location = useLocation();
  const navigate = useNavigate();

  const [userDropdown, setUserDropdown] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Sync portal mode with URL if needed
  useEffect(() => {
    if (!activeUser) return;
    if (location.pathname.startsWith("/portal") && portalMode !== "participant") {
      setPortalMode("participant");
    } else if (
      (location.pathname.startsWith("/admin") ||
        location.pathname === "/" ||
        location.pathname === "/check" ||
        location.pathname === "/quarantine" ||
        location.pathname === "/ledger" ||
        location.pathname === "/model" ||
        location.pathname === "/network") &&
      portalMode !== "admin" &&
      (activeUser.role === "ADMIN" || activeUser.role === "AUDITOR")
    ) {
      setPortalMode("admin");
    }
  }, [location.pathname, activeUser, portalMode, setPortalMode]);

  const navItems = portalMode === "admin" ? ADMIN_NAV : PARTICIPANT_NAV;
  const isAdminOrAuditor = activeUser?.role === "ADMIN" || activeUser?.role === "AUDITOR";

  return (
    <header className="space-y-3">
      {/* Upper Bar: Brand, Dual-Portal Switcher, Simulator, Profile */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2.5" aria-label="AgriChain Sentinel home">
            <span className="spin-slow inline-flex">
              <SunMark size={34} />
            </span>
            <span className="hidden leading-tight lg:block">
              <span className="block text-sm font-semibold tracking-wide text-ink">AgriChain</span>
              <span className="block text-[10px] font-bold tracking-[0.25em] text-gold">SENTINEL</span>
            </span>
          </Link>

          {/* Role-Specific Portal Header Pill / Switcher */}
          {activeUser && (
            activeUser.role === "ADMIN" ? (
              <div className="flex items-center rounded-2xl border border-line bg-panel p-1 shadow-sm">
                <button
                  onClick={() => {
                    setPortalMode("admin");
                    if (location.pathname.startsWith("/portal")) {
                      navigate("/admin/lifecycle");
                    }
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    portalMode === "admin"
                      ? "bg-gold text-gold-ink shadow-md"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Building2 size={14} />
                  <span>Admin Tower</span>
                </button>

                <button
                  onClick={() => {
                    setPortalMode("participant");
                    if (!location.pathname.startsWith("/portal")) {
                      navigate("/portal");
                    }
                  }}
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                    portalMode === "participant"
                      ? "bg-gold text-gold-ink shadow-md"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <Users size={14} />
                  <span>Participant Portal</span>
                </button>
              </div>
            ) : activeUser.role === "AUDITOR" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm">
                <ShieldCheck size={14} className="text-gold" />
                <span>Auditor Regulatory Tower</span>
                <span className="rounded-full bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-mono font-bold text-gold">
                  AUDITOR
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-2xl border border-line bg-panel px-3.5 py-1.5 text-xs font-bold text-ink shadow-sm">
                <Users size={14} className="text-gold" />
                <span>Participant Workspace</span>
                <span className="rounded-full bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-mono font-bold text-gold">
                  {activeUser.role}
                </span>
              </div>
            )
          )}
        </div>

        {/* Right side tools */}
        <div className="flex items-center gap-2.5">
          {/* Simulator Controls - ONLY for Admin and Auditor */}
          {isAdminOrAuditor && <SimulatorPill />}

          {/* Live Chain Notification Center */}
          {activeUser && <NotificationCenter />}

          {/* User Account & Sign Out Menu - NO SWITCHER LIST */}
          {activeUser ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setUserDropdown((prev) => !prev)}
                className="flex items-center gap-2 rounded-xl border border-line bg-panel px-2.5 py-1 text-xs transition hover:border-line-2"
                title="User Account Menu"
                aria-label="Account Menu"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-gold to-[#a8761c] text-[11px] font-bold text-gold-ink">
                  {activeUser.name
                    .split(" ")
                    .map((p) => p[0])
                    .join("")
                    .slice(0, 2)}
                </div>
                <div className="hidden sm:block text-left leading-tight">
                  <span className="block font-bold text-ink max-w-[110px] truncate">{activeUser.name}</span>
                  <span className="block text-[9px] font-mono text-gold font-bold">
                    {activeUser.role}
                    {activeUser.participant_id ? ` · ${activeUser.participant_id}` : ""}
                  </span>
                </div>
                <ChevronDown size={13} className="text-muted ml-0.5" />
              </button>

              {userDropdown && (
                <div className="slide-in absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-2xl border border-line bg-panel-2 p-3 shadow-2xl">
                  {/* Current Active Account Profile */}
                  <div className="border-b border-line pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-gold to-[#a8761c] text-xs font-bold text-gold-ink shadow-sm">
                        {activeUser.name
                          .split(" ")
                          .map((p) => p[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-ink truncate">{activeUser.name}</h4>
                        <p className="text-[11px] text-muted truncate">{activeUser.email}</p>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-between rounded-xl bg-panel p-2 border border-line text-[11px]">
                      <div>
                        <span className="text-muted block text-[10px]">Session Role</span>
                        <span className="font-bold text-gold font-mono">{activeUser.role}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted block text-[10px]">Org Identity</span>
                        <span className="font-bold text-ink font-mono">{activeUser.participant_id || "SYSTEM"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Navigation Shortcuts - Role Adaptive */}
                  <div className="py-2 border-b border-line space-y-1">
                    {isAdminOrAuditor ? (
                      <Link
                        to="/admin/network"
                        onClick={() => setUserDropdown(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-ink hover:bg-panel-3 transition"
                      >
                        <Network size={14} className="text-gold" />
                        <span>Cryptographic Registry</span>
                      </Link>
                    ) : (
                      <Link
                        to="/portal/identity"
                        onClick={() => setUserDropdown(false)}
                        className="flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-xs text-ink hover:bg-panel-3 transition"
                      >
                        <ShieldCheck size={14} className="text-emerald-400" />
                        <span>Cryptographic Keys & Identity</span>
                      </Link>
                    )}
                  </div>

                  {/* Sign Out Action - Required to change accounts */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setUserDropdown(false);
                        try {
                          await clerk.signOut();
                        } catch {
                          /* ignore */
                        }
                        logout();
                        navigate("/login");
                      }}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-quar/15 border border-quar/30 px-3 py-2 text-xs font-bold text-quar hover:bg-quar/25 transition"
                    >
                      <LogOut size={14} />
                      <span>Sign Out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="btn-gold flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold shadow"
            >
              <KeyRound size={13} />
              <span>Sign In</span>
            </Link>
          )}
        </div>
      </div>

      {/* Navigation Bar */}
      {activeUser && (
        <nav
          className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-panel p-1.5 shadow-sm overflow-x-auto"
          aria-label="Portal Navigation"
        >
          {navItems.map(({ to, label, Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition shrink-0 ${
                  isActive
                    ? "bg-gold text-gold-ink shadow-sm"
                    : "text-ink-2 hover:bg-panel-2 hover:text-ink"
                }`
              }
            >
              <Icon size={15} aria-hidden />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
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
      className="relative flex items-center gap-2.5 rounded-xl border border-line bg-panel py-1 pl-3 pr-1 shadow-sm"
    >
      <span className={`h-2 w-2 rounded-full ${running ? "live-dot bg-gold" : "bg-muted"}`} aria-hidden />
      <Toggle on={running} onChange={setRunning} label="Live simulator" />
      <span className="hidden md:inline text-xs font-semibold text-ink">{running ? "Stream" : "Sim"}</span>
      <select
        aria-label="Simulator speed"
        value={speedMs}
        onChange={(e) => setSpeedMs(Number(e.target.value))}
        className="!w-auto !rounded-lg !py-0.5 !pl-1.5 !pr-1 text-xs border-0 bg-transparent text-ink"
      >
        <option value={3500}>0.5x</option>
        <option value={2000}>1x</option>
        <option value={900}>2x</option>
      </select>
      <button
        onClick={() => setMenu((m) => !m)}
        disabled={busy && !running}
        className="btn-gold flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold"
        aria-haspopup="menu"
        aria-expanded={menu}
      >
        <Syringe size={13} />
        <span className="hidden sm:inline">Inject</span>
        <ChevronDown size={11} />
      </button>
      {menu && (
        <div
          role="menu"
          className="slide-in absolute right-0 top-[calc(100%+8px)] z-40 w-72 rounded-2xl border border-line bg-panel-2 p-2 shadow-2xl"
        >
          <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wider text-muted font-bold">
            Inject Synthetic Attack Vector
          </p>
          {meta?.fraud_types.map((f) => (
            <button
              key={f.type}
              role="menuitem"
              onClick={async () => {
                setMenu(false);
                await inject(f.type);
              }}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-ink hover:bg-panel-3"
            >
              <span className="font-semibold">{f.label}</span>
              <span className="text-[10px] text-muted">{FRAUD_HINT[f.type]}</span>
            </button>
          ))}
          <button
            onClick={() => {
              setMenu(false);
              navigate("/check");
            }}
            className="mt-1 w-full rounded-xl border border-dashed border-line px-3 py-2 text-xs text-muted hover:text-ink text-left"
          >
            Or craft manual transaction on Check page →
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
      style={{ position: "fixed", right: "24px", bottom: "24px", zIndex: 9999 }}
      className="pointer-events-none flex w-80 flex-col-reverse gap-2"
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
