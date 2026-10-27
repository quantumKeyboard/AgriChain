import { Gavel } from "lucide-react";
import type { RuleHit, ShapItem } from "../api/types";
import { C } from "../lib/tokens";

/** Diverging horizontal bars: SHAP contribution toward fraud (right) or toward legitimate (left). */
export function ShapBars({ items }: { items: ShapItem[] }) {
  if (!items.length) return <p className="text-xs text-muted">No explanation available.</p>;
  const max = Math.max(...items.map((i) => Math.abs(i.contribution)), 0.01);
  return (
    <div className="space-y-2.5">
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-muted">
        <span>← pushes toward legitimate</span>
        <span>pushes toward fraud →</span>
      </div>
      {items.map((it) => {
        const w = (Math.abs(it.contribution) / max) * 50;
        const pos = it.contribution >= 0;
        return (
          <div key={it.feature} className="group">
            <div className="mb-1 flex justify-between gap-2 text-xs">
              <span className="text-ink-2">{it.label}</span>
              <span className="tnum font-mono text-muted">
                value {formatValue(it.value)} · {pos ? "+" : ""}
                {it.contribution.toFixed(3)}
              </span>
            </div>
            <div
              className="relative h-2.5 rounded-full bg-panel-3"
              title={`${it.label}: ${it.contribution.toFixed(4)}`}
            >
              <div className="absolute left-1/2 top-[-3px] h-[16px] w-px bg-[#55534c]" />
              <div
                className="absolute top-0 h-2.5 transition-all"
                style={{
                  left: pos ? "50%" : `${50 - w}%`,
                  width: `${w}%`,
                  background: pos ? C.gold : C.muted,
                  borderRadius: pos ? "0 4px 4px 0" : "4px 0 0 4px",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatValue(v: number): string {
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(2);
}

export function RuleList({ hits }: { hits: RuleHit[] }) {
  if (!hits.length)
    return (
      <p className="text-xs text-muted">No business rule fired — any risk comes from the ML models alone.</p>
    );
  return (
    <ul className="space-y-2">
      {hits
        .slice()
        .sort((a, b) => b.severity - a.severity)
        .map((h) => (
          <li key={h.id} className="card-inner flex gap-3 p-3">
            <Gavel size={16} className="mt-0.5 shrink-0 text-gold" aria-hidden />
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-gold">
                {h.id}
                <span className="tnum font-mono font-normal text-muted">
                  severity {(h.severity * 100).toFixed(0)}%
                </span>
              </p>
              <p className="mt-0.5 text-sm text-ink-2">{h.reason}</p>
            </div>
          </li>
        ))}
    </ul>
  );
}

/** The three components of the hybrid score as compact meters. */
export function ScoreBreakdown({
  p,
  rules,
  anomaly,
  weights = { ml: 0.6, rules: 0.25, anomaly: 0.15 },
}: {
  p: number;
  rules: number;
  anomaly: number;
  weights?: { ml: number; rules: number; anomaly: number };
}) {
  const rows = [
    { label: "Random Forest P(fraud)", v: p, w: weights.ml },
    { label: "Rule engine severity", v: rules, w: weights.rules },
    { label: "Isolation Forest anomaly", v: anomaly, w: weights.anomaly },
  ];
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-ink-2">
              {r.label} <span className="text-muted">× {r.w}</span>
            </span>
            <span className="tnum font-mono text-ink">{(r.v * 100).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-panel-3">
            <div className="h-1.5 rounded-full bg-gold transition-all" style={{ width: `${r.v * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
