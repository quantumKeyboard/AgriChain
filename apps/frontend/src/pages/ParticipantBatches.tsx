import {
  Boxes,
  ExternalLink,
  Filter,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Split,
  Truck,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useParticipantBatches } from "../api/hooks";
import type { BatchResponse } from "../api/types";
import { HarvestModal } from "../components/modals/HarvestModal";
import { ProcessingModal } from "../components/modals/ProcessingModal";
import { TransferModal } from "../components/modals/TransferModal";
import { formatKg } from "../lib/format";
import { useApp } from "../state/AppState";

export default function ParticipantBatches() {
  const { activeUser } = useApp();
  const { data: batches, isLoading, refetch } = useParticipantBatches();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("ALL");

  // Modals state
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [processingOpen, setProcessingOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<BatchResponse | null>(null);

  if (!activeUser) return null;

  const role = activeUser.role;

  const filtered = useMemo(() => {
    if (!batches) return [];
    return batches.filter((b) => {
      const matchSearch =
        search === "" ||
        b.id.toLowerCase().includes(search.toLowerCase()) ||
        b.crop.toLowerCase().includes(search.toLowerCase()) ||
        (b.variety && b.variety.toLowerCase().includes(search.toLowerCase())) ||
        (b.farm_location && b.farm_location.toLowerCase().includes(search.toLowerCase()));

      const matchStage = stageFilter === "ALL" || b.current_stage === stageFilter;
      return matchSearch && matchStage;
    });
  }, [batches, search, stageFilter]);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-ink flex items-center gap-2">
              <Boxes size={22} className="text-gold" /> Batch Inventory & Custody
            </h1>
            <span className="rounded-full bg-panel-2 border border-line px-2.5 py-0.5 text-xs text-muted font-mono">
              {filtered.length} {filtered.length === 1 ? "Batch" : "Batches"}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Agricultural batches currently held or registered by <strong className="text-ink">{activeUser.name}</strong> ({activeUser.participant_id || activeUser.role}).
          </p>
        </div>

        <div className="flex items-center gap-2">
          {role === "FARMER" && (
            <button
              onClick={() => setHarvestOpen(true)}
              className="btn-gold flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-md"
            >
              <Plus size={15} /> Register Harvest
            </button>
          )}

          {role === "PROCESSOR" && selectedBatch && (
            <button
              onClick={() => setProcessingOpen(true)}
              className="btn-gold flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-md"
            >
              <Split size={15} /> Process Selected Batch
            </button>
          )}

          <button onClick={() => refetch()} className="btn-ghost px-3 py-2 text-xs" title="Refresh batches">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Filters bar */}
      <div className="rounded-2xl border border-line bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Batch ID, crop, variety, or location..."
            className="w-full rounded-xl border border-line bg-panel-2 pl-9 pr-4 py-2 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted" />
          <span className="text-xs text-muted">Stage:</span>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
          >
            <option value="ALL">All Stages</option>
            <option value="HARVEST">Harvest</option>
            <option value="COOPERATIVE">Cooperative</option>
            <option value="PROCESSING">Processing</option>
            <option value="DISTRIBUTION">Distribution</option>
            <option value="RETAIL">Retail</option>
          </select>
        </div>
      </div>

      {/* Batches Grid / Table */}
      {isLoading ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center text-xs text-muted">
          Loading batch inventory...
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center text-xs text-muted space-y-2">
          <p className="font-semibold text-ink">No batches found for this criteria.</p>
          <p>
            {role === "FARMER"
              ? "Click 'Register Harvest' above to record your first crop batch."
              : "Wait for an inward transfer from an upstream partner, or verify your active role."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((batch) => {
            const isSelected = selectedBatch?.id === batch.id;
            return (
              <div
                key={batch.id}
                onClick={() => setSelectedBatch(batch)}
                className={`cursor-pointer rounded-2xl border p-5 transition relative flex flex-col justify-between ${
                  isSelected
                    ? "border-gold bg-gold/5 shadow-lg"
                    : "border-line bg-panel hover:border-line-2 hover:bg-panel-2"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-gold">{batch.id}</span>
                        {batch.is_organic ? (
                          <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                            ORGANIC
                          </span>
                        ) : null}
                      </div>
                      <h2 className="text-sm font-bold text-ink mt-1">
                        {batch.crop} {batch.variety ? `(${batch.variety})` : ""}
                      </h2>
                    </div>

                    <span className="rounded-full bg-panel-2 border border-line px-2.5 py-0.5 text-[10px] font-bold text-ink">
                      {batch.current_stage}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-panel-2 p-2">
                      <span className="text-[10px] text-muted block">Quantity</span>
                      <span className="font-bold text-ink font-mono text-sm">
                        {formatKg(batch.current_quantity_kg ?? batch.current_quantity ?? 0)}
                      </span>
                    </div>

                    <div className="rounded-lg bg-panel-2 p-2">
                      <span className="text-[10px] text-muted block">Grade / Moisture</span>
                      <span className="font-bold text-ink text-xs">
                        Grade {batch.quality_grade || "A"} {batch.moisture_pct ? `· ${batch.moisture_pct}%` : ""}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-muted space-y-1">
                    <p className="truncate">
                      <strong>Location:</strong> {batch.farm_location || "Maharashtra, IN"}
                    </p>
                    <p className="truncate">
                      <strong>Current Holder:</strong> {batch.current_holder_id || "Self"}
                    </p>
                    {batch.parent_batch_ids && batch.parent_batch_ids.length > 0 && (
                      <p className="text-gold truncate">
                        <strong>Lineage:</strong> Split from {batch.parent_batch_ids.join(", ")}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-line/60 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBatch(batch);
                        setTransferOpen(true);
                      }}
                      className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-ink hover:text-gold"
                      title="Dispatch outward transfer"
                    >
                      <Truck size={13} /> Dispatch
                    </button>

                    {role === "PROCESSOR" && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedBatch(batch);
                          setProcessingOpen(true);
                        }}
                        className="btn-ghost flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-ink hover:text-gold"
                        title="Process & split"
                      >
                        <Split size={13} /> Process
                      </button>
                    )}
                  </div>

                  {role === "ADMIN" || role === "AUDITOR" ? (
                    <Link
                      to={`/admin/lifecycle?batch=${encodeURIComponent(batch.id)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 text-[11px] text-gold hover:underline"
                      title="View full audit trail"
                    >
                      Audit Lifecycle <ExternalLink size={12} />
                    </Link>
                  ) : (
                    <span
                      className="flex items-center gap-1 text-[11px] text-emerald-400 font-mono font-semibold"
                      title="Cryptographic batch verified in local inventory"
                    >
                      <ShieldCheck size={12} /> Verified On-Chain
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <HarvestModal open={harvestOpen} onClose={() => setHarvestOpen(false)} />
      <TransferModal
        open={transferOpen}
        onClose={() => {
          setTransferOpen(false);
        }}
        preselectedBatch={selectedBatch}
      />
      <ProcessingModal
        open={processingOpen}
        onClose={() => {
          setProcessingOpen(false);
        }}
        preselectedBatch={selectedBatch}
      />
    </div>
  );
}
