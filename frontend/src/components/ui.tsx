import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`card p-5 ${className}`}>{children}</section>;
}

export function CardTitle({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div>
        <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function PageTitle({
  title,
  sup,
  sub,
  right,
}: {
  title: string;
  sup?: ReactNode;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-light tracking-tight text-ink">
          {title}
          {sup !== undefined && <sup className="ml-1 align-super text-sm font-medium text-muted">{sup}</sup>}
        </h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof CheckCircle2 }> = {
  CLEAR: { label: "Clear", cls: "text-clear-ink border-clear/50 bg-clear/15", Icon: ShieldCheck },
  COMMITTED: { label: "Committed", cls: "text-clear-ink border-clear/50 bg-clear/15", Icon: CheckCircle2 },
  APPROVED: { label: "Approved", cls: "text-clear-ink border-clear/50 bg-clear/15", Icon: CheckCircle2 },
  FLAGGED: { label: "Flagged", cls: "text-flag-ink border-flag/50 bg-flag/15", Icon: AlertTriangle },
  QUARANTINED: { label: "Quarantined", cls: "text-quar-ink border-quar/50 bg-quar/15", Icon: ShieldAlert },
  PENDING_REVIEW: { label: "Awaiting review", cls: "text-quar-ink border-quar/50 bg-quar/15", Icon: Clock },
  REJECTED: { label: "Rejected", cls: "text-quar-ink border-quar/50 bg-quar/15", Icon: ShieldX },
  PENDING: { label: "Off-chain", cls: "text-ink-2 border-line bg-panel-3", Icon: Clock },
};

export function StatusBadge({ status, small = false }: { status: string; small?: boolean }) {
  const m = STATUS_META[status] ?? STATUS_META.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border font-medium ${m.cls} ${
        small ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs"
      }`}
    >
      <m.Icon size={small ? 11 : 13} aria-hidden />
      {m.label}
    </span>
  );
}

export function RiskPill({ risk }: { risk: number }) {
  const tone = risk >= 0.7 ? "text-quar-ink" : risk >= 0.4 ? "text-flag-ink" : "text-clear-ink";
  return <span className={`tnum font-mono text-xs font-medium ${tone}`}>{(risk * 100).toFixed(0)}%</span>;
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-quar/40 bg-quar/10 px-4 py-3 text-sm text-quar-ink">
      <span className="flex items-center gap-2">
        <XCircle size={16} /> {(error as Error)?.message ?? "Something went wrong"}
      </span>
      {onRetry && (
        <button className="btn-ghost px-3 py-1 text-xs" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      {icon && <div className="text-muted">{icon}</div>}
      <p className="text-sm font-medium text-ink-2">{title}</p>
      {body && <p className="max-w-sm text-xs text-muted">{body}</p>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="pill inline-flex border border-line bg-panel-2 p-1" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={`pill px-3 py-1 text-xs font-medium transition ${
            value === o.value ? "bg-gold text-gold-ink" : "text-muted hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="tnum mt-1 text-lg font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-muted">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 rounded-full border transition ${on ? "border-gold bg-gold" : "border-line bg-panel-3"}`}
    >
      <span
        className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${
          on ? "left-[22px] bg-gold-ink" : "left-0.5 bg-ink-2"
        }`}
      />
    </button>
  );
}
