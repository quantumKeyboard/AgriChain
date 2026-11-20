import type { ReactNode } from "react";
import type { Heatmap } from "../api/types";
import { cap } from "../lib/format";
import { C, goldRamp } from "../lib/tokens";

/** Dark tooltip shell used by every Recharts chart. Text uses ink tokens; colour only on the swatch. */
export function ChartTooltip({
  active,
  label,
  payload,
  labelFormatter,
  valueFormatter = (v) => String(v),
}: {
  active?: boolean;
  label?: string | number;
  payload?: { name?: string; value?: number | string; color?: string; dataKey?: string }[];
  labelFormatter?: (l: string | number) => ReactNode;
  valueFormatter?: (v: number | string, name?: string) => ReactNode;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-panel-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label !== undefined && (
        <p className="mb-1 font-medium text-ink">{labelFormatter ? labelFormatter(label) : label}</p>
      )}
      {payload.map((p) => (
        <p key={p.dataKey ?? p.name} className="flex items-center gap-2 text-ink-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          <span className="text-muted">{p.name}</span>
          <span className="tnum ml-auto font-mono text-ink">
            {p.value !== undefined ? valueFormatter(p.value, p.name) : "—"}
          </span>
        </p>
      ))}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span className="h-2 w-2 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Region × crop heatmap: single-hue gold ramp for average risk; count shown in every cell. */
export function RiskHeatmap({ data }: { data: Heatmap }) {
  const maxRisk = Math.max(0.3, ...data.cells.map((c) => c.avg_risk ?? 0));
  const cell = (r: string, c: string) => data.cells.find((x) => x.region === r && x.crop === c);
  return (
    <div className="overflow-x-auto scroll-thin">
      <table className="w-full min-w-[520px] border-separate" style={{ borderSpacing: 3 }}>
        <thead>
          <tr>
            <th className="w-32" />
            {data.crops.map((c) => (
              <th key={c} className="pb-1 text-center text-[11px] font-medium text-muted">
                {cap(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.regions.map((r) => (
            <tr key={r}>
              <th className="pr-2 text-left text-[11px] font-medium text-muted">{r}</th>
              {data.crops.map((c) => {
                const x = cell(r, c);
                const v = x?.avg_risk ?? null;
                const bg = v === null ? C.panel2 : goldRamp(v / maxRisk);
                const dark = v !== null && v / maxRisk > 0.55;
                return (
                  <td
                    key={c}
                    title={
                      x && x.count
                        ? `${r} · ${cap(c)}: ${x.count} tx, avg risk ${((v ?? 0) * 100).toFixed(0)}%, ${x.flagged} flagged`
                        : `${r} · ${cap(c)}: no transactions`
                    }
                    className="h-10 rounded-lg text-center align-middle transition hover:outline hover:outline-1 hover:outline-gold"
                    style={{ background: bg }}
                  >
                    <span
                      className={`tnum text-[11px] font-semibold ${dark ? "text-gold-ink" : "text-ink-2"}`}
                    >
                      {x && x.count ? `${((v ?? 0) * 100).toFixed(0)}%` : "·"}
                    </span>
                    {x && x.flagged > 0 && (
                      <span className={`block text-[9px] ${dark ? "text-gold-ink/80" : "text-muted"}`}>
                        ⚑ {x.flagged}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-muted">
        <span>Avg risk</span>
        <span
          className="h-2 w-32 rounded-full"
          style={{ background: `linear-gradient(90deg, ${goldRamp(0)}, ${goldRamp(1)})` }}
        />
        <span>0% → {(maxRisk * 100).toFixed(0)}%</span>
        <span className="ml-3">⚑ = flagged or quarantined count</span>
      </div>
    </div>
  );
}
