import { ArrowUpRight, Boxes, CheckCircle2, Download, Link2, ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { exportUrl } from "../api/client";
import {
  useBlocks,
  useFraudByType,
  useHeatmap,
  useStages,
  useSummary,
  useTimeseries,
  useTransactions,
  useVerify,
} from "../api/hooks";
import { ChartTooltip, Legend, RiskHeatmap } from "../components/charts";
import { SunMark } from "../components/RiskSun";
import { TxDrawer } from "../components/TxDrawer";
import {
  Card,
  CardTitle,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  RiskPill,
  Segmented,
  StatusBadge,
} from "../components/ui";
import { CROP_EMOJI, STAGE_LABEL, inrCompact, kg, num, shortHash, timeAgo } from "../lib/format";
import { C, axisProps } from "../lib/tokens";
import { useApp } from "../state/AppState";

export default function Dashboard() {
  const [openTx, setOpenTx] = useState<string | null>(null);
  const { running } = useApp();
  return (
    <>
      <PageTitle
        title="Overview"
        sup={running ? "live" : undefined}
        sub="Every agricultural supply-chain transaction is scored by the hybrid ML engine before it can be written to the ledger."
        right={
          <div className="flex items-center gap-2">
            <a
              href={exportUrl("transactions.csv")}
              className="btn-ghost flex items-center gap-1.5 px-4 py-2.5 text-sm"
            >
              <Download size={15} /> Export CSV
            </a>
            <Link to="/check" className="btn-gold flex items-center gap-1.5 px-4 py-2.5 text-sm">
              + Check a transaction
            </Link>
          </div>
        }
      />
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <HeroRow />
          <DecisionsOverTime />
          <div className="grid gap-5 lg:grid-cols-2">
            <RiskStream onOpen={setOpenTx} />
            <FraudByType />
          </div>
          <Card>
            <CardTitle
              title="Risk by region × crop"
              sub="Average hybrid risk of transactions sold from each region"
            />
            <HeatmapBlock />
          </Card>
        </div>
        <div className="space-y-5 xl:col-span-4">
          <ChainCard />
          <LiveFeed onOpen={setOpenTx} />
          <Card>
            <CardTitle
              title="Where in the chain"
              sub="Flagged + quarantined / total, per supply-chain stage"
            />
            <StageBars />
          </Card>
        </div>
      </div>
      <TxDrawer id={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}

function HeroRow() {
  const { data, isLoading, error, refetch } = useSummary();
  if (isLoading)
    return (
      <Card>
        <Loading />
      </Card>
    );
  if (error || !data) return <ErrorBox error={error} onRetry={refetch} />;
  const gt = data.ground_truth;
  const catchRate = gt.injected ? gt.caught / gt.injected : 1;
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="relative overflow-hidden lg:col-span-3">
        <div className="pointer-events-none absolute -right-10 -top-10 opacity-20">
          <SunMark size={220} />
        </div>
        <p className="text-xs text-muted">Value screened</p>
        <p className="tnum mt-1 text-5xl font-light tracking-tight text-ink">
          {inrCompact(data.value_screened)}
        </p>
        <p className="mt-2 text-xs text-muted">
          across <span className="text-ink-2">{num(data.transactions)}</span> transactions ·{" "}
          <span className="text-ink-2">{data.chain_height}</span> blocks
        </p>
        <div className="mt-6">
          <div className="mb-2 flex justify-between text-[11px] text-muted">
            <span>Decision mix</span>
            <span className="tnum">
              {num(data.clear)} clear · {num(data.flagged)} flagged · {num(data.quarantined)} quarantined
            </span>
          </div>
          <div
            className="flex h-3 gap-[2px] overflow-hidden rounded-full"
            role="img"
            aria-label="Decision mix"
          >
            <div style={{ flex: data.clear, background: C.clear }} />
            <div style={{ flex: data.flagged, background: C.flag }} />
            <div style={{ flex: data.quarantined, background: C.quar }} />
          </div>
          <div className="mt-2">
            <Legend
              items={[
                { label: "Clear", color: C.clear },
                { label: "Flagged", color: C.flag },
                { label: "Quarantined", color: C.quar },
              ]}
            />
          </div>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-5 lg:col-span-2">
        <Kpi
          label="Fraud value stopped"
          value={inrCompact(data.value_blocked)}
          icon={<ShieldX size={16} />}
          hint={`${data.rejected} rejected on-chain`}
        />
        <Kpi
          label="Awaiting review"
          value={String(data.open_quarantine)}
          icon={<ShieldCheck size={16} />}
          hint="quarantine queue"
          to="/quarantine"
          highlight={data.open_quarantine > 0}
        />
        <Kpi
          label="Injected fraud caught"
          value={`${(catchRate * 100).toFixed(0)}%`}
          icon={<CheckCircle2 size={16} />}
          hint={`${gt.caught}/${gt.injected} simulator cases`}
        />
        <Kpi
          label="False quarantines"
          value={String(gt.false_alarms)}
          icon={<ArrowUpRight size={16} />}
          hint={`of ${num(gt.legit)} legit tx`}
        />
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  icon,
  to,
  highlight,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  to?: string;
  highlight?: boolean;
}) {
  const body = (
    <div
      className={`card h-full p-4 transition ${to ? "hover:border-gold/60" : ""} ${highlight ? "border-quar/50" : ""}`}
    >
      <div className="flex items-center justify-between text-muted">
        <span className="text-[11px]">{label}</span>
        <span className={highlight ? "text-quar-ink" : "text-gold"}>{icon}</span>
      </div>
      <p className="tnum mt-3 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
    </div>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}

function DecisionsOverTime() {
  const [range, setRange] = useState<"live" | "day">("day");
  const bucket = range === "live" ? 5 : 120;
  const buckets = range === "live" ? 24 : 24;
  const { data, isLoading, error, refetch } = useTimeseries(bucket, buckets);
  return (
    <Card>
      <CardTitle
        title="Transactions over time"
        sub={range === "live" ? "Last 2 hours · 5-minute buckets" : "Last 48 hours · 2-hour buckets"}
        right={
          <Segmented
            value={range}
            onChange={setRange}
            options={[
              { value: "live", label: "2 h" },
              { value: "day", label: "48 h" },
            ]}
          />
        }
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : !data?.some((d) => d.n) ? (
        <Empty
          title="No transactions in this window"
          body="Start the simulator to stream live transactions."
        />
      ) : (
        <>
          <div className="mb-2">
            <Legend
              items={[
                { label: "Clear", color: C.clear },
                { label: "Flagged", color: C.flag },
                { label: "Quarantined", color: C.quar },
              ]}
            />
          </div>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={data} margin={{ left: -18, right: 6, top: 6 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  {...axisProps}
                  tickFormatter={(t: string) =>
                    new Date(t).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
                  }
                  minTickGap={30}
                />
                <YAxis {...axisProps} allowDecimals={false} />
                <Tooltip
                  cursor={{ stroke: C.muted, strokeDasharray: "3 3" }}
                  content={
                    <ChartTooltip
                      labelFormatter={(t) =>
                        new Date(String(t)).toLocaleString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                          day: "2-digit",
                          month: "short",
                        })
                      }
                    />
                  }
                />
                <Area
                  type="monotone"
                  dataKey="clear"
                  name="Clear"
                  stackId="1"
                  stroke={C.clear}
                  fill={C.clear}
                  fillOpacity={0.35}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="flagged"
                  name="Flagged"
                  stackId="1"
                  stroke={C.flag}
                  fill={C.flag}
                  fillOpacity={0.5}
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="quarantined"
                  name="Quarantined"
                  stackId="1"
                  stroke={C.quar}
                  fill={C.quar}
                  fillOpacity={0.6}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function RiskStream({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useTransactions({ limit: 60 });
  const points = (data ?? [])
    .slice()
    .reverse()
    .map((t, i) => ({ i, risk: Math.round(t.risk * 1000) / 10, id: t.id, crop: t.crop }));
  return (
    <Card>
      <CardTitle title="Live risk stream" sub="Hybrid risk of the last 60 transactions (%)" />
      {isLoading ? (
        <Loading />
      ) : (
        <div className="h-52">
          <ResponsiveContainer>
            <LineChart data={points} margin={{ left: -18, right: 8, top: 8 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="i" hide />
              <YAxis {...axisProps} domain={[0, 100]} ticks={[0, 40, 70, 100]} />
              <ReferenceLine
                y={70}
                stroke={C.quar}
                strokeDasharray="4 4"
                label={{ value: "quarantine", fill: C.muted, fontSize: 10, position: "insideTopRight" }}
              />
              <ReferenceLine
                y={40}
                stroke={C.flag}
                strokeDasharray="4 4"
                label={{ value: "flag", fill: C.muted, fontSize: 10, position: "insideTopRight" }}
              />
              <Tooltip
                cursor={{ stroke: C.muted, strokeDasharray: "3 3" }}
                content={
                  <ChartTooltip labelFormatter={() => "Transaction"} valueFormatter={(v) => `${v}%`} />
                }
              />
              <Line
                type="linear"
                dataKey="risk"
                name="Risk"
                stroke={C.gold}
                strokeWidth={2}
                isAnimationActive={false}
                dot={(p: { cx?: number; cy?: number; payload?: { risk: number; id: string } }) =>
                  p.payload && p.payload.risk >= 40 ? (
                    <circle
                      key={p.payload.id}
                      cx={p.cx}
                      cy={p.cy}
                      r={5}
                      fill={p.payload.risk >= 70 ? C.quar : C.flag}
                      stroke={C.panel}
                      strokeWidth={2}
                      style={{ cursor: "pointer" }}
                      onClick={() => onOpen(p.payload!.id)}
                    />
                  ) : (
                    <g key={p.payload?.id ?? Math.random()} />
                  )
                }
                activeDot={{ r: 6, fill: C.gold, stroke: C.panel, strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function FraudByType() {
  const { data, isLoading } = useFraudByType();
  const rows = (data ?? []).slice().sort((a, b) => b.count - a.count);
  return (
    <Card>
      <CardTitle title="Suspected fraud by type" sub="Flagged + quarantined, by the model's type guess" />
      {isLoading ? (
        <Loading />
      ) : !rows.some((r) => r.count) ? (
        <Empty title="No fraud detected yet" />
      ) : (
        <div className="h-52">
          <ResponsiveContainer>
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 30 }} barCategoryGap={6}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="label" {...axisProps} axisLine={false} width={150} />
              <Tooltip cursor={{ fill: "rgba(255,255,255,0.03)" }} content={<ChartTooltip />} />
              <Bar dataKey="count" name="Transactions" fill={C.gold} radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList dataKey="count" position="right" fill={C.ink2} fontSize={11} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

function HeatmapBlock() {
  const { data, isLoading, error, refetch } = useHeatmap();
  if (isLoading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} onRetry={refetch} />;
  return <RiskHeatmap data={data} />;
}

function StageBars() {
  const { data, isLoading } = useStages();
  if (isLoading || !data) return <Loading />;
  return (
    <div className="space-y-4">
      {data.map((s) => {
        const total = s.clear + s.flagged + s.quarantined || 1;
        return (
          <div key={s.stage}>
            <div className="mb-1.5 flex justify-between text-xs">
              <span className="text-ink-2">{STAGE_LABEL[s.stage]}</span>
              <span className="tnum text-muted">
                {s.flagged + s.quarantined} / {total}
              </span>
            </div>
            <div
              className="flex h-2 gap-[2px] overflow-hidden rounded-full bg-panel-3"
              title={`${s.clear} clear, ${s.flagged} flagged, ${s.quarantined} quarantined`}
            >
              <div style={{ flex: s.clear, background: C.clear }} />
              <div style={{ flex: s.flagged, background: C.flag }} />
              <div style={{ flex: s.quarantined, background: C.quar }} />
            </div>
          </div>
        );
      })}
      <Legend
        items={[
          { label: "Clear", color: C.clear },
          { label: "Flagged", color: C.flag },
          { label: "Quarantined", color: C.quar },
        ]}
      />
    </div>
  );
}

function ChainCard() {
  const { data, isLoading } = useBlocks(6);
  const verify = useVerify();
  const v = verify.data;
  return (
    <Card>
      <CardTitle
        title="Ledger"
        sub={
          data
            ? `Height #${data.height} · ${data.pending} tx in mempool · PoW difficulty ${data.difficulty}`
            : undefined
        }
        right={
          <Link to="/ledger" className="btn-ghost px-3 py-1.5 text-xs">
            Explore
          </Link>
        }
      />
      {isLoading || !data ? (
        <Loading />
      ) : (
        <div className="flex items-center gap-1 overflow-hidden">
          {data.blocks
            .slice(0, 5)
            .reverse()
            .map((b, i, arr) => (
              <div key={b.index} className="flex items-center gap-1">
                <Link
                  to={`/ledger?block=${b.index}`}
                  className="card-inner flex w-[62px] flex-col items-center gap-1 px-1 py-2.5 hover:border-gold/60"
                  title={b.hash}
                >
                  <Boxes size={15} className="text-gold" />
                  <span className="tnum text-xs font-semibold text-ink">#{b.index}</span>
                  <span className="font-mono text-[9px] text-muted">{b.hash.slice(0, 6)}</span>
                </Link>
                {i < arr.length - 1 && <Link2 size={12} className="text-muted" aria-hidden />}
              </div>
            ))}
        </div>
      )}
      <button
        onClick={() => verify.mutate()}
        className="btn-gold mt-4 w-full py-2.5 text-sm"
        disabled={verify.isPending}
      >
        {verify.isPending ? "Verifying…" : "Verify entire chain"}
      </button>
      {v && (
        <p
          className={`mt-3 rounded-2xl px-3 py-2 text-xs ${v.valid ? "bg-clear/15 text-clear-ink" : "bg-quar/15 text-quar-ink"}`}
          role="status"
        >
          {v.valid
            ? `✓ All ${v.blocks_checked} blocks verified — hashes, Merkle roots and links intact.`
            : `✗ Tampering detected at block #${v.first_broken_index}: ${v.reason}`}
        </p>
      )}
    </Card>
  );
}

function LiveFeed({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading, error, refetch } = useTransactions({ limit: 10 });
  return (
    <Card>
      <CardTitle title="Transaction history" sub="Newest first · click for the full explanation" />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : (
        <ul className="space-y-1.5">
          {data!.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onOpen(t.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition hover:bg-panel-2"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel-3 text-lg"
                  aria-hidden
                >
                  {CROP_EMOJI[t.crop]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="tnum text-sm text-ink">{kg(t.quantity_kg)}</span>
                    <span className="truncate text-xs text-muted">
                      {t.seller_name} → {t.buyer_name}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
                    {t.tx_hash ? shortHash(t.tx_hash) : t.id} · {timeAgo(t.timestamp)}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1">
                  <RiskPill risk={t.risk} />
                  {t.decision !== "CLEAR" && <StatusBadge status={t.decision} small />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
