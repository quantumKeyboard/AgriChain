import { Factory, Leaf, Repeat2, ShoppingBasket, Store, Tractor, Truck } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useBatches, useTrail } from "../api/hooks";
import type { TxView } from "../api/types";
import { ChartTooltip } from "../components/charts";
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
import { CROP_EMOJI, ROLE_LABEL, STAGE_LABEL, cap, clock, inr, kg, timeAgo } from "../lib/format";
import { C, axisProps } from "../lib/tokens";

const ROLE_ICON: Record<string, typeof Tractor> = {
  FARMER: Tractor,
  COOP: Store,
  PROCESSOR: Factory,
  DISTRIBUTOR: Truck,
  RETAILER: ShoppingBasket,
};

export default function Trace() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<"flagged" | "all">(params.get("batch") ? "all" : "flagged");
  const { data: batches, isLoading, error, refetch } = useBatches(filter === "flagged");
  const selected = params.get("batch") ?? batches?.[0]?.id ?? null;
  const [openTx, setOpenTx] = useState<string | null>(null);

  return (
    <>
      <PageTitle
        title="Batch trace"
        sub="Follow a produce batch from the farm gate to the retail shelf. Every hop carries its fraud assessment and on-chain status."
      />
      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-4">
          <CardTitle
            title="Batches"
            sub="Most recent activity first"
            right={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "flagged", label: "With flags" },
                  { value: "all", label: "All" },
                ]}
              />
            }
          />
          {isLoading ? (
            <Loading />
          ) : error ? (
            <ErrorBox error={error} onRetry={refetch} />
          ) : !batches?.length ? (
            <Empty title="No batches match" />
          ) : (
            <ul className="scroll-thin max-h-[640px] space-y-1.5 overflow-y-auto pr-1">
              {batches.map((b) => (
                <li key={b.id}>
                  <button
                    onClick={() => setParams({ batch: b.id })}
                    className={`card-inner flex w-full items-center gap-3 p-3 text-left transition ${
                      selected === b.id ? "!border-gold" : "hover:border-[#4a4a46]"
                    }`}
                  >
                    <span className="text-2xl" aria-hidden>
                      {b.crop ? CROP_EMOJI[b.crop] : "📦"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-ink">{b.id}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {cap(b.crop ?? "")} · {b.region} · {b.hops} hop{b.hops === 1 ? "" : "s"} ·{" "}
                        {timeAgo(b.last_activity)}
                      </span>
                      {b.fraud_types.length > 0 && (
                        <span className="mt-0.5 block truncate text-[11px] text-gold">
                          {b.fraud_types.join(", ")}
                        </span>
                      )}
                    </span>
                    <RiskPill risk={b.max_risk} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="xl:col-span-8">
          {selected ? (
            <TrailView id={selected} onOpen={setOpenTx} />
          ) : (
            <Card>
              <Empty title="Pick a batch" />
            </Card>
          )}
        </div>
      </div>
      <TxDrawer id={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}

function TrailView({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { data, isLoading, error, refetch } = useTrail(id);
  if (isLoading)
    return (
      <Card>
        <Loading />
      </Card>
    );
  if (error || !data) return <ErrorBox error={error} onRetry={refetch} />;
  const { batch, hops } = data;
  const seen = new Set<string>([hops[0]?.seller_id]);
  const circular = new Set<string>();
  for (const h of hops) {
    if (seen.has(h.buyer_id)) circular.add(h.id);
    seen.add(h.buyer_id);
  }
  const qty = hops.map((h, i) => ({
    name: `Hop ${i + 1}`,
    qty: h.quantity_kg,
    decision: h.decision,
    label: STAGE_LABEL[h.stage],
  }));

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-center gap-5">
          <span
            className="flex h-16 w-16 items-center justify-center rounded-full bg-panel-3 text-4xl"
            aria-hidden
          >
            {CROP_EMOJI[batch.crop]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted">{batch.id}</p>
            <p className="text-2xl font-light text-ink">
              {cap(batch.crop)} from {batch.region}
            </p>
            <p className="mt-1 text-xs text-muted">
              Grown by <span className="text-ink-2">{batch.origin_name}</span> · harvested{" "}
              {clock(batch.harvest_date)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {batch.organic_claimed && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
                  batch.organic_cert_valid ? "border-clear/50 text-clear-ink" : "border-quar/50 text-quar-ink"
                }`}
              >
                <Leaf size={12} /> Organic {batch.organic_cert_valid ? "certified" : "— no certificate"}
              </span>
            )}
            <span className="inline-flex items-center rounded-full border border-line px-2.5 py-1 text-xs text-ink-2">
              {hops.length} hops on chain
            </span>
          </div>
        </div>
        <Journey hops={hops} circular={circular} />
      </Card>

      <Card>
        <CardTitle title="Timeline" sub="Click a hop for its full explanation" />
        <ol className="relative ml-3 border-l border-line">
          {hops.map((h, i) => (
            <Hop key={h.id} h={h} n={i + 1} circular={circular.has(h.id)} onOpen={onOpen} />
          ))}
        </ol>
      </Card>

      {hops.length > 1 && (
        <Card>
          <CardTitle
            title="Quantity along the chain"
            sub="Should shrink slightly per hop (handling losses). Jumps upward suggest phantom quantity."
          />
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={qty} margin={{ left: 0, right: 8 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis {...axisProps} tickFormatter={(v: number) => kg(v)} width={60} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.03)" }}
                  content={<ChartTooltip valueFormatter={(v) => kg(Number(v))} />}
                />
                <Bar dataKey="qty" name="Quantity" radius={[4, 4, 0, 0]} barSize={36}>
                  {qty.map((q) => (
                    <Cell
                      key={q.name}
                      fill={q.decision === "CLEAR" ? C.gold : q.decision === "FLAGGED" ? C.flag : C.quar}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            Bars are gold when clear; amber/red when the hop was flagged/quarantined.
          </p>
        </Card>
      )}
    </div>
  );
}

function Journey({ hops, circular }: { hops: TxView[]; circular: Set<string> }) {
  if (!hops.length) return null;
  const nodes = [
    { id: hops[0].seller_id, name: hops[0].seller_name, role: hops[0].seller_role ?? "FARMER" },
  ].concat(hops.map((h) => ({ id: h.buyer_id, name: h.buyer_name, role: h.buyer_role ?? "" })));
  return (
    <div className="scroll-thin mt-6 flex items-center gap-1 overflow-x-auto pb-2">
      {nodes.map((n, i) => {
        const Icon = ROLE_ICON[n.role] ?? Store;
        const hop = hops[i - 1];
        const loop = hop && circular.has(hop.id);
        const tone = hop
          ? hop.decision === "CLEAR"
            ? C.line
            : hop.decision === "FLAGGED"
              ? C.flag
              : C.quar
          : C.line;
        return (
          <div key={i} className="flex shrink-0 items-center gap-1">
            {i > 0 && (
              <div className="flex w-16 flex-col items-center">
                {loop ? <Repeat2 size={14} className="text-quar-ink" /> : <span className="h-3.5" />}
                <div className="h-[2px] w-full rounded" style={{ background: tone }} />
                <span className="mt-1 text-[9px] text-muted">{hop ? kg(hop.quantity_kg) : ""}</span>
              </div>
            )}
            <div
              className="flex w-[104px] flex-col items-center gap-1 rounded-2xl border bg-panel-2 px-2 py-3 text-center"
              style={{ borderColor: loop ? C.quar : C.line }}
              title={`${n.name} (${n.id})`}
            >
              <Icon size={18} className="text-gold" />
              <span className="text-[10px] uppercase tracking-wider text-muted">
                {ROLE_LABEL[n.role] ?? n.role}
              </span>
              <span className="w-full truncate text-[11px] text-ink-2">{n.name}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Hop({
  h,
  n,
  circular,
  onOpen,
}: {
  h: TxView;
  n: number;
  circular: boolean;
  onOpen: (id: string) => void;
}) {
  const dot = h.decision === "CLEAR" ? C.clear : h.decision === "FLAGGED" ? C.flag : C.quar;
  return (
    <li className="mb-5 ml-6 last:mb-0">
      <span
        className="absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2"
        style={{ background: dot, borderColor: C.panel }}
        aria-hidden
      />
      <button
        onClick={() => onOpen(h.id)}
        className="card-inner w-full p-4 text-left transition hover:border-gold/50"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-ink">
            {n}. {STAGE_LABEL[h.stage]}
            {circular && (
              <span className="ml-2 text-xs text-quar-ink">↺ goods returned to an earlier holder</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <RiskPill risk={h.risk} />
            <StatusBadge status={h.ledger_status} small />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">
          {h.seller_name} → {h.buyer_name} · {kg(h.quantity_kg)} @ {inr(h.unit_price)}/kg ·{" "}
          {clock(h.timestamp)}
          {h.block_number !== null && <> · Ethereum block #{h.block_number}</>}
        </p>
        {h.rule_hits.length > 0 && (
          <ul className="mt-2 space-y-1">
            {h.rule_hits.map((r) => (
              <li key={r.id} className="text-xs text-ink-2">
                <span className="font-semibold text-gold">{r.id}</span> — {r.reason}
              </li>
            ))}
          </ul>
        )}
      </button>
    </li>
  );
}
