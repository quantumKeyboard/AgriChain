import { Repeat2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { useNetwork, useParticipants } from "../api/hooks";
import type { NetworkData, ParticipantView } from "../api/types";
import { ChartTooltip, Legend } from "../components/charts";
import { Card, CardTitle, Empty, ErrorBox, Loading, PageTitle } from "../components/ui";
import { ROLE_LABEL, inrCompact } from "../lib/format";
import { C } from "../lib/tokens";

const ROLES = ["FARMER", "COOP", "PROCESSOR", "DISTRIBUTOR", "RETAILER"];

export default function Network() {
  const net = useNetwork();
  const people = useParticipants();
  const [focus, setFocus] = useState<string | null>(null);
  return (
    <>
      <PageTitle
        title="Trade network"
        sub="Who sells to whom. Legitimate goods flow left → right; a red arc flowing backwards is goods returning to an earlier holder — the signature of circular trading."
      />
      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="self-start xl:col-span-8">
          <CardTitle
            title="Flow graph"
            sub="Last 500 transactions · hover or click a participant"
            right={
              <Legend
                items={[
                  { label: "Clear trades", color: "#3a3936" },
                  { label: "Flagged", color: C.flag },
                  { label: "Circular", color: C.quar },
                ]}
              />
            }
          />
          {net.isLoading ? (
            <Loading />
          ) : net.error || !net.data ? (
            <ErrorBox error={net.error} onRetry={net.refetch} />
          ) : (
            <FlowGraph data={net.data} focus={focus} setFocus={setFocus} />
          )}
        </Card>
        <div className="space-y-5 xl:col-span-4">
          <TrustCard people={people.data} focus={focus} setFocus={setFocus} loading={people.isLoading} />
          <Card>
            <CardTitle title="Detected cycles" sub="Closed loops in the trade graph (networkx)" />
            {!net.data?.cycles.length ? (
              <Empty title="No cycles" body="Inject “Circular trading” to create one." icon={<Repeat2 />} />
            ) : (
              <ul className="space-y-2">
                {net.data.cycles.slice(0, 8).map((c, i) => (
                  <li
                    key={i}
                    className="card-inner flex flex-wrap items-center gap-1 p-2.5 font-mono text-[11px] text-ink-2"
                  >
                    <Repeat2 size={13} className="mr-1 text-quar-ink" />
                    {[...c, c[0]].map((id, j) => (
                      <span key={j} className="flex items-center gap-1">
                        <button onClick={() => setFocus(id)} className="hover:text-gold">
                          {id}
                        </button>
                        {j < c.length && <span className="text-muted">→</span>}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

function FlowGraph({
  data,
  focus,
  setFocus,
}: {
  data: NetworkData;
  focus: string | null;
  setFocus: (id: string | null) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const active = hover ?? focus;
  const W = 900;
  const { pos, H } = useMemo(() => {
    const cols: Record<string, NetworkData["nodes"]> = {};
    for (const r of ROLES)
      cols[r] = data.nodes.filter((n) => n.role === r).sort((a, b) => a.id.localeCompare(b.id));
    const maxN = Math.max(...Object.values(cols).map((c) => c.length), 1);
    const H = Math.max(420, Math.min(900, maxN * 11 + 60));
    const pos: Record<string, { x: number; y: number }> = {};
    ROLES.forEach((r, ci) => {
      const list = cols[r];
      const x = 70 + (ci * (W - 140)) / (ROLES.length - 1);
      list.forEach((n, i) => {
        pos[n.id] = { x, y: 40 + ((i + 0.5) * (H - 60)) / list.length };
      });
    });
    return { pos, H };
  }, [data]);

  const nodeById = useMemo(() => Object.fromEntries(data.nodes.map((n) => [n.id, n])), [data]);
  const related = (e: NetworkData["edges"][number]) => !active || e.source === active || e.target === active;
  const edges = data.edges
    .slice()
    .sort((a, b) => Number(a.circular) - Number(b.circular) || a.flagged - b.flagged);
  const info = active ? nodeById[active] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Trade network flow graph">
        {ROLES.map((r, ci) => (
          <text
            key={r}
            x={70 + (ci * (W - 140)) / (ROLES.length - 1)}
            y={18}
            textAnchor="middle"
            fill={C.muted}
            fontSize={11}
          >
            {ROLE_LABEL[r]}
          </text>
        ))}
        {edges.map((e, i) => {
          const a = pos[e.source];
          const b = pos[e.target];
          if (!a || !b) return null;
          const back = b.x <= a.x;
          const color = e.circular || back ? C.quar : e.flagged ? C.flag : "#3a3936";
          const on = related(e);
          const mx = (a.x + b.x) / 2;
          const d = back
            ? `M${a.x},${a.y} C${a.x - 40},${a.y - 90} ${b.x + 40},${b.y - 90} ${b.x},${b.y}`
            : `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
          return (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={e.circular || back ? 2 : Math.min(1 + e.count * 0.4, 3)}
              opacity={on ? (e.circular || e.flagged ? 0.95 : 0.55) : 0.06}
            >
              <title>{`${e.source} → ${e.target}: ${e.count} trade(s), ${inrCompact(e.value)}, max risk ${(e.max_risk * 100).toFixed(0)}%`}</title>
            </path>
          );
        })}
        {data.nodes.map((n) => {
          const p = pos[n.id];
          if (!p) return null;
          const isActive = n.id === active;
          const fill = n.trust < 60 ? C.quar : n.trust < 85 ? C.flag : C.gold;
          return (
            <g
              key={n.id}
              onMouseEnter={() => setHover(n.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setFocus(focus === n.id ? null : n.id)}
              style={{ cursor: "pointer" }}
            >
              <circle cx={p.x} cy={p.y} r={10} fill="transparent" />
              <circle
                cx={p.x}
                cy={p.y}
                r={isActive ? 7 : n.role === "FARMER" ? 3.5 : 5}
                fill={fill}
                stroke={n.in_cycle ? C.quar : C.panel}
                strokeWidth={n.in_cycle ? 2 : 1.5}
              />
              {(isActive || (n.role !== "FARMER" && n.in_cycle)) && (
                <text x={p.x + 10} y={p.y + 4} fill={C.ink} fontSize={11}>
                  {n.id}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {info && (
        <div className="pointer-events-none absolute right-2 top-8 rounded-2xl border border-line bg-panel-2/95 px-3 py-2 text-xs shadow-xl">
          <p className="font-semibold text-ink">{info.name}</p>
          <p className="text-muted">
            {info.id} · {ROLE_LABEL[info.role]} · {info.region}
          </p>
          <p className="mt-1 text-ink-2">
            Trust score <b className="tnum">{info.trust}</b>
            {info.in_cycle && <span className="ml-2 text-quar-ink">in a trade cycle</span>}
          </p>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Node colour = trust score (gold ≥ 85 · amber 60–85 · red &lt; 60). Red ring = part of a detected
        cycle.
      </p>
    </div>
  );
}

function TrustCard({
  people,
  focus,
  setFocus,
  loading,
}: {
  people: ParticipantView[] | undefined;
  focus: string | null;
  setFocus: (id: string | null) => void;
  loading: boolean;
}) {
  if (loading || !people)
    return (
      <Card>
        <Loading />
      </Card>
    );
  const sel = people.find((p) => p.id === focus) ?? people[0];
  const radar = Object.entries(sel.dims).map(([k, v]) => ({ dim: k, v }));
  return (
    <Card>
      <CardTitle title="Participant trust" sub="Derived from on-chain history · lowest first" />
      <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-center">
        <div className="h-52 w-60 shrink-0">
          <ResponsiveContainer>
            <RadarChart data={radar} outerRadius="62%">
              <PolarGrid stroke={C.line} />
              <PolarAngleAxis dataKey="dim" tick={{ fill: C.muted, fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Radar
                dataKey="v"
                name="Score"
                stroke={C.gold}
                fill={C.gold}
                fillOpacity={0.3}
                strokeWidth={2}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink">{sel.name}</p>
          <p className="text-[11px] text-muted">
            {sel.id} · {ROLE_LABEL[sel.role]} · {sel.region}
          </p>
          <p className="tnum mt-2 text-4xl font-light text-ink">{sel.trust}</p>
          <p className="text-[11px] text-muted">
            {sel.sold} sold · {sel.flagged} flagged · {sel.rejected} rejected
          </p>
        </div>
      </div>
      <ul className="scroll-thin mt-4 max-h-64 space-y-1 overflow-y-auto pr-1">
        {people.slice(0, 25).map((p) => (
          <li key={p.id}>
            <button
              onClick={() => setFocus(p.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left text-xs hover:bg-panel-2 ${p.id === sel.id ? "bg-panel-2" : ""}`}
            >
              <span className="w-12 font-mono text-muted">{p.id}</span>
              <span className="min-w-0 flex-1 truncate text-ink-2">{p.name}</span>
              <span className="h-1.5 w-16 rounded-full bg-panel-3">
                <span
                  className="block h-1.5 rounded-full"
                  style={{
                    width: `${p.trust}%`,
                    background: p.trust < 60 ? C.quar : p.trust < 85 ? C.flag : C.gold,
                  }}
                />
              </span>
              <span className="tnum w-8 text-right text-ink">{p.trust.toFixed(0)}</span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
