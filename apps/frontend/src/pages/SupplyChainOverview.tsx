import {
  ArrowRight,
  Factory,
  Layers,
  RefreshCw,
  Store,
  Truck,
  Users,
  Wheat,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useStageOverview } from "../api/hooks";
import { formatKg } from "../lib/format";

const STAGE_META: Record<string, { label: string; icon: typeof Wheat; description: string }> = {
  FARMER: {
    label: "Farmer / Producer",
    icon: Wheat,
    description: "Harvest, acreage verification, origin declarations, initial yield checks.",
  },
  COOP: {
    label: "Cooperative Aggregator",
    icon: Users,
    description: "Aggregation, weighbridge checks, tolerance & handling loss reconciliation.",
  },
  PROCESSOR: {
    label: "Industrial Processor",
    icon: Factory,
    description: "Fractionation, pulping, milling, batch splits & parent-child lineage tracking.",
  },
  DISTRIBUTOR: {
    label: "Distributor / Logistics",
    icon: Truck,
    description: "Cold-chain transport, telemetry sensor tracking, route & speed verification.",
  },
  RETAILER: {
    label: "Retailer / Consumer Inward",
    icon: Store,
    description: "Final delivery acceptance, farm-to-fork pedigree check, retail inventory.",
  },
};

export default function SupplyChainOverview() {
  const { data: overview, isLoading, refetch } = useStageOverview();
  const [selectedStage, setSelectedStage] = useState<string>("FARMER");

  const stages = overview?.stages || [];
  const currentStageData = stages.find((s) => s.stage === selectedStage) || stages[0];

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-muted">Loading supply-chain pipeline...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Supply-Chain Overview</h1>
          <p className="mt-1 text-sm text-muted">
            End-to-end pipeline visibility: track total volume, active handoffs, and fraud alerts across every stage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-muted block">Total Active Produce</span>
            <span className="text-lg font-bold text-gold tnum">
              {formatKg(overview?.total_active_produce_kg || 0)}
            </span>
          </div>
          <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Main Visual Pipeline Flow */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {stages.map((stg, idx) => {
          const meta = STAGE_META[stg.stage] || { label: stg.stage, icon: Layers, description: "" };
          const Icon = meta.icon;
          const isSelected = selectedStage === stg.stage;

          return (
            <button
              key={stg.stage}
              onClick={() => setSelectedStage(stg.stage)}
              className={`rounded-2xl border p-4 text-left transition relative flex flex-col justify-between ${
                isSelected
                  ? "border-gold bg-gold/10 shadow-lg"
                  : "border-line bg-panel hover:border-gold/50 hover:bg-panel-2"
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-panel-2 p-2.5 text-gold">
                    <Icon size={18} />
                  </span>
                  <span className="text-xs font-bold text-muted">0{idx + 1}</span>
                </div>
                <h3 className="mt-3 font-bold text-sm text-ink">{meta.label}</h3>
                <p className="mt-0.5 text-[11px] text-muted line-clamp-2">{meta.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-line/50 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Batches:</span>
                  <span className="font-bold text-ink tnum">{stg.batch_count}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Volume:</span>
                  <span className="font-bold text-gold tnum">{formatKg(stg.total_quantity_kg)}</span>
                </div>
                {stg.quarantined_count > 0 && (
                  <div className="flex justify-between text-xs text-quar font-semibold">
                    <span>Quarantined:</span>
                    <span>{stg.quarantined_count}</span>
                  </div>
                )}
                {stg.disputed_count > 0 && (
                  <div className="flex justify-between text-xs text-amber-400 font-semibold">
                    <span>Disputed:</span>
                    <span>{stg.disputed_count}</span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected Stage Detail Panel */}
      {currentStageData && (
        <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-ink">
                Produce at Stage: {STAGE_META[currentStageData.stage]?.label || currentStageData.stage}
              </h2>
              <p className="text-xs text-muted">
                {currentStageData.batch_count} batches currently undergoing operations or pending transfer.
              </p>
            </div>
            <Link
              to={`/admin/lifecycle`}
              className="text-gold text-xs font-semibold hover:underline flex items-center gap-1"
            >
              Open Lifecycle Explorer <ArrowRight size={14} />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {currentStageData.batches.length > 0 ? (
              currentStageData.batches.map((b) => (
                <div key={b.id} className="rounded-xl border border-line bg-panel-2 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-gold font-mono">{b.id}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        b.status === "ACTIVE"
                          ? "bg-clear/20 text-clear"
                          : b.status === "IN_TRANSIT"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-quar/20 text-quar"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted">
                    <span className="capitalize">{b.crop} ({b.variety})</span>
                    <span className="font-bold text-ink">{formatKg(b.quantity_kg)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-line/40 text-[11px] text-muted">
                    <span>Region: {b.region}</span>
                    <Link
                      to={`/admin/lifecycle?id=${b.id}`}
                      className="text-gold hover:underline font-semibold"
                    >
                      Track Batch →
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted col-span-3 py-6 text-center">No active batches at this stage.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
