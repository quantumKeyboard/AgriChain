import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  MapPin,
  RefreshCw,
  Search,
  ShieldCheck,
  Split,
  Thermometer,
} from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useFullLifecycle, useLifecycleBatches } from "../api/hooks";
import { formatCryptoHash, formatKg } from "../lib/format";
import { StatusBadge } from "../components/ui";

export default function LifecycleExplorer() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedBatchId = searchParams.get("id") || "AGRI-MH-SOL-2026-00001";
  const [searchInput, setSearchInput] = useState("");
  const [activeTab, setActiveTab] = useState<"timeline" | "transfers" | "lineage" | "telemetry" | "blockchain">("timeline");

  const { data: batches, isLoading: batchesLoading } = useLifecycleBatches({ search: searchInput });
  const { data: lifecycle, isLoading: detailLoading, refetch } = useFullLifecycle(selectedBatchId);

  const selectBatch = (id: string) => {
    setSearchParams({ id });
  };

  const batch = lifecycle?.batch;
  const events = lifecycle?.events || [];
  const transfers = lifecycle?.transfers || [];
  const operations = lifecycle?.processing_operations || [];
  const lineage = lifecycle?.lineage;
  const telemetry = lifecycle?.telemetry || [];
  const transactions = lifecycle?.transactions || [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Lifecycle Explorer</h1>
            <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-xs font-semibold text-gold">
              Batch-Centric Traceability
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Track agricultural produce from origin farm harvest through handoffs, processing, and cold-chain to retail.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
            title="Refresh lifecycle data"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Batch Selector & Search Bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4 items-start">
        <div className="rounded-2xl border border-line bg-panel p-4 lg:col-span-1 lg:sticky lg:top-4 flex flex-col h-[calc(100vh-140px)] min-h-[580px] max-h-[880px]">
          <div className="relative mb-3 shrink-0">
            <Search className="absolute left-3 top-2.5 text-muted pointer-events-none" size={15} />
            <input
              type="text"
              placeholder="Search batches..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{ paddingLeft: "36px" }}
              className="w-full rounded-xl border border-line bg-panel-2 py-2 pr-3 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1.5 scroll-thin pb-10">
            {batchesLoading ? (
              <p className="py-4 text-center text-xs text-muted">Loading batches...</p>
            ) : batches && batches.length > 0 ? (
              batches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => selectBatch(b.id)}
                  className={`w-full rounded-xl p-2.5 text-left transition ${
                    selectedBatchId === b.id
                      ? "border border-gold/40 bg-gold/10 text-ink"
                      : "border border-transparent bg-panel-2/50 text-ink-2 hover:bg-panel-2 hover:text-ink"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-gold truncate max-w-[150px]">{b.id}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        b.status === "ACTIVE"
                          ? "bg-clear/20 text-clear"
                          : b.status === "IN_TRANSIT"
                            ? "bg-amber-500/20 text-amber-400"
                            : b.status === "QUARANTINED"
                              ? "bg-quar/20 text-quar"
                              : b.status === "DISPUTED"
                                ? "bg-red-500/20 text-red-400"
                                : "bg-panel-3 text-muted"
                      }`}
                    >
                      {b.status}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-muted">
                    <span className="capitalize">{b.crop} · {b.variety}</span>
                    <span>{formatKg(b.current_quantity_kg || b.initial_quantity_kg)}</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="py-4 text-center text-xs text-muted">No batches found</p>
            )}
          </div>
        </div>

        {/* Selected Batch Overview Card */}
        <div className="lg:col-span-3 space-y-4">
          {detailLoading ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-line bg-panel">
              <p className="text-sm text-muted">Loading lifecycle pedigree...</p>
            </div>
          ) : batch ? (
            <>
              <div className="rounded-2xl border border-line bg-panel p-5">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-bold text-ink">{batch.id}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          batch.status === "ACTIVE"
                            ? "bg-clear/20 text-clear"
                            : batch.status === "IN_TRANSIT"
                              ? "bg-amber-500/20 text-amber-400"
                              : batch.status === "QUARANTINED"
                                ? "bg-quar/20 text-quar"
                                : batch.status === "DISPUTED"
                                  ? "bg-red-500/20 text-red-400"
                                  : "bg-panel-3 text-muted"
                        }`}
                      >
                        {batch.status}
                      </span>
                      {batch.organic_claimed && (
                        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
                          🌱 Certified Organic
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      Crop: <strong className="text-ink capitalize">{batch.crop}</strong> ({batch.variety}) · Harvested on{" "}
                      {new Date(batch.harvest_date).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="text-right">
                    <div className="text-xs text-muted">Current Quantity</div>
                    <div className="text-2xl font-bold text-gold tnum">{formatKg(batch.current_quantity_kg)}</div>
                    <div className="text-[11px] text-muted">Initial: {formatKg(batch.initial_quantity_kg)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-4 sm:grid-cols-4 text-xs">
                  <div>
                    <span className="text-muted block">Origin Farmer</span>
                    <span className="font-semibold text-ink">{batch.origin_farmer_name || batch.origin_farmer_id}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Location / Farm</span>
                    <span className="font-semibold text-ink flex items-center gap-1">
                      <MapPin size={12} className="text-gold" /> {batch.farm_location || batch.region}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted block">Current Stage</span>
                    <span className="font-semibold text-gold">{batch.current_stage}</span>
                  </div>
                  <div>
                    <span className="text-muted block">Current Custodian</span>
                    <span className="font-semibold text-ink">{batch.current_holder_name || batch.current_holder_id || "—"}</span>
                  </div>
                </div>

                {batch.cert_reference && (
                  <div className="mt-4 flex items-center gap-2 rounded-xl border border-line/60 bg-panel-2 px-3 py-2 text-xs text-ink-2">
                    <ShieldCheck size={14} className="text-emerald-400" />
                    <span>Certification Reference:</span>
                    <code className="text-gold font-mono text-[11px]">{batch.cert_reference}</code>
                  </div>
                )}
              </div>

              {/* Tabs Navigation */}
              <div className="flex border-b border-line gap-2">
                {[
                  { key: "timeline", label: `Chronological Timeline (${events.length})` },
                  { key: "transfers", label: `Two-Sided Transfers (${transfers.length})` },
                  { key: "lineage", label: `Batch Lineage & Splits (${lineage?.children.length || 0})` },
                  { key: "telemetry", label: `Cold-Chain Telemetry (${telemetry.length})` },
                  { key: "blockchain", label: `Ledger Blocks (${transactions.length})` },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key as typeof activeTab)}
                    className={`border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
                      activeTab === t.key
                        ? "border-gold text-gold"
                        : "border-transparent text-muted hover:text-ink"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* TAB 1: Chronological Timeline */}
              {activeTab === "timeline" && (
                <div className="space-y-4">
                  {events.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-panel p-8 text-center text-xs text-muted">
                      No lifecycle events recorded for this batch yet.
                    </div>
                  ) : (
                    <div className="relative pl-6 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-line space-y-4">
                      {events.map((evt, idx) => {
                        const isDispute = evt.event_type.includes("DISPUTE") || evt.status === "FLAGGED";
                        const isAlert = evt.event_type.includes("ALERT") || evt.status === "QUARANTINED";
                        return (
                          <div key={evt.id || idx} className="relative rounded-2xl border border-line bg-panel p-4">
                            <span
                              className={`absolute -left-6 top-4 h-3.5 w-3.5 rounded-full border-2 border-panel ${
                                isAlert
                                  ? "bg-quar"
                                  : isDispute
                                    ? "bg-amber-400"
                                    : "bg-clear"
                              }`}
                            />
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold uppercase tracking-wider text-gold">
                                    {evt.event_type.replace(/_/g, " ")}
                                  </span>
                                  <span className="rounded bg-panel-2 px-2 py-0.5 text-[10px] font-semibold text-ink">
                                    Stage: {evt.stage}
                                  </span>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                      evt.status === "VALIDATED"
                                        ? "bg-clear/20 text-clear"
                                        : evt.status === "FLAGGED"
                                          ? "bg-amber-500/20 text-amber-400"
                                          : evt.status === "QUARANTINED"
                                            ? "bg-quar/20 text-quar"
                                            : "bg-panel-3 text-muted"
                                    }`}
                                  >
                                    {evt.status}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-ink-2">
                                  Actor: <strong className="text-ink">{evt.actor_name || evt.actor_id}</strong>
                                  {evt.recipient_name && (
                                    <>
                                      {" "}➜ Recipient: <strong className="text-ink">{evt.recipient_name}</strong>
                                    </>
                                  )}
                                </p>
                              </div>
                              <span className="text-[11px] text-muted">
                                {new Date(evt.timestamp).toLocaleString()}
                              </span>
                            </div>

                            {/* Event Metrics & Discrepancy */}
                            <div className="mt-3 flex flex-wrap gap-4 border-t border-line/50 pt-2 text-xs">
                              {evt.quantity_after_kg !== null && evt.quantity_after_kg !== undefined && (
                                <div>
                                  <span className="text-muted block text-[10px]">Quantity</span>
                                  <span className="font-semibold text-ink">{formatKg(evt.quantity_after_kg)}</span>
                                </div>
                              )}
                              {evt.quantity_diff_kg != null && evt.quantity_diff_kg !== 0 && (
                                <div>
                                  <span className="text-muted block text-[10px]">Delta</span>
                                  <span
                                    className={`font-semibold ${
                                      evt.quantity_diff_kg < 0 ? "text-amber-400" : "text-clear"
                                    }`}
                                  >
                                    {evt.quantity_diff_kg > 0 ? "+" : ""}
                                    {formatKg(evt.quantity_diff_kg)}
                                  </span>
                                </div>
                              )}
                              {evt.temperature_c !== null && evt.temperature_c !== undefined && (
                                <div>
                                  <span className="text-muted block text-[10px]">Temperature</span>
                                  <span className={`font-semibold ${evt.temperature_c > 15 ? "text-quar" : "text-ink"}`}>
                                    {evt.temperature_c}°C
                                  </span>
                                </div>
                              )}
                              {evt.signature && (
                                <div>
                                  <span className="text-muted block text-[10px]">Ed25519 Signature</span>
                                  <span className="font-mono text-[10px] text-emerald-400 flex items-center gap-1">
                                    <ShieldCheck size={11} /> {formatCryptoHash(evt.signature)}
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Event Details JSON preview */}
                            {evt.details && Object.keys(evt.details).length > 0 && (
                              <div className="mt-2.5 rounded-xl bg-panel-2 p-2.5 text-[11px] text-muted">
                                {Object.entries(evt.details).map(([k, v]) => (
                                  <div key={k} className="flex justify-between py-0.5">
                                    <span className="capitalize">{k.replace(/_/g, " ")}:</span>
                                    <span className="font-mono text-ink-2">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: Two-Sided Transfers & Handoffs */}
              {activeTab === "transfers" && (
                <div className="space-y-4">
                  {transfers.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-panel p-8 text-center text-xs text-muted">
                      No transfer handoffs recorded for this batch.
                    </div>
                  ) : (
                    transfers.map((trf) => (
                      <div key={trf.id} className="rounded-2xl border border-line bg-panel p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink">{trf.id}</span>
                            <span className="rounded bg-panel-2 px-2 py-0.5 text-xs text-gold">
                              {trf.stage}
                            </span>
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-bold ${
                                trf.status === "ACCEPTED"
                                  ? "bg-clear/20 text-clear"
                                  : trf.status === "IN_TRANSIT"
                                    ? "bg-amber-500/20 text-amber-400"
                                    : "bg-red-500/20 text-red-400"
                              }`}
                            >
                              {trf.status}
                            </span>
                          </div>
                          <span className="text-xs text-muted">
                            {new Date(trf.dispatched_at).toLocaleDateString()}
                          </span>
                        </div>

                        {/* Two-Sided Balance Grid */}
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="rounded-xl border border-line/60 bg-panel-2 p-3">
                            <span className="text-[10px] text-muted block uppercase font-bold">1. Sender Dispatch</span>
                            <div className="mt-1 font-semibold text-ink">{trf.sender_name || trf.sender_id}</div>
                            <div className="mt-1 text-lg font-bold text-gold">{formatKg(trf.dispatched_quantity_kg)}</div>
                            <div className="mt-2 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                              <ShieldCheck size={11} /> Signed by Sender
                            </div>
                          </div>

                          <div className="rounded-xl border border-line/60 bg-panel-2 p-3">
                            <span className="text-[10px] text-muted block uppercase font-bold">2. Reconciliation & Delta</span>
                            <div className="mt-1 text-xs text-muted">Tolerance: ±{formatKg(trf.tolerance_kg)}</div>
                            <div
                              className={`mt-1 text-lg font-bold ${
                                trf.discrepancy_flagged ? "text-red-400" : "text-ink"
                              }`}
                            >
                              Discrepancy: {formatKg(trf.discrepancy_kg)}
                            </div>
                            {trf.discrepancy_flagged && (
                              <div className="mt-2 text-[10px] text-red-400 flex items-center gap-1">
                                <AlertTriangle size={11} /> Exceeds Permissible Tolerance!
                              </div>
                            )}
                          </div>

                          <div className="rounded-xl border border-line/60 bg-panel-2 p-3">
                            <span className="text-[10px] text-muted block uppercase font-bold">3. Receiver Inward</span>
                            <div className="mt-1 font-semibold text-ink">{trf.receiver_name || trf.receiver_id}</div>
                            <div className="mt-1 text-lg font-bold text-ink">
                              {trf.received_quantity_kg !== null && trf.received_quantity_kg !== undefined
                                ? formatKg(trf.received_quantity_kg)
                                : "Pending Inward"}
                            </div>
                            {trf.receiver_signature ? (
                              <div className="mt-2 text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                                <ShieldCheck size={11} /> Signed by Receiver
                              </div>
                            ) : (
                              <div className="mt-2 text-[10px] text-amber-400">Awaiting Receiver Signature</div>
                            )}
                          </div>
                        </div>

                        {trf.dispute_reason && (
                          <div className="mt-3 rounded-xl bg-red-500/10 border border-red-500/20 p-2.5 text-xs text-red-300">
                            <strong>Dispute Reason:</strong> {trf.dispute_reason}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* TAB 3: Lineage & Splits */}
              {activeTab === "lineage" && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-line bg-panel p-5">
                    <h3 className="text-sm font-bold text-ink mb-2 flex items-center gap-2">
                      <Split size={16} className="text-gold" /> Parent-Child Batch Transformation Tree
                    </h3>
                    <p className="text-xs text-muted mb-4">
                      When raw produce enters a processing facility, it can be fractionated, pulped, or packaged into multiple child lots while preserving complete source origin.
                    </p>

                    {operations.length > 0 && (
                      <div className="mb-6 space-y-3">
                        <span className="text-xs font-bold text-gold uppercase tracking-wider">
                          Processing Operations Recorded
                        </span>
                        {operations.map((op) => (
                          <div key={op.id} className="rounded-xl border border-line bg-panel-2 p-3.5 text-xs">
                            <div className="flex justify-between items-center font-semibold text-ink">
                              <span>{op.operation_name}</span>
                              <span className="text-gold">Yield: {op.yield_percentage}%</span>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2 text-muted">
                              <div>Input: <strong className="text-ink">{formatKg(op.input_quantity_kg)}</strong></div>
                              <div>Output: <strong className="text-ink">{formatKg(op.output_quantity_kg)}</strong></div>
                              <div>Waste / Loss: <strong className="text-amber-400">{formatKg(op.waste_quantity_kg)}</strong></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {lineage && lineage.links.length > 0 ? (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-muted uppercase tracking-wider">
                          Lineage Graph Links
                        </span>
                        {lineage.links.map((lnk, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between rounded-xl border border-line/60 bg-panel-2 p-3 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-gold font-bold">{lnk.parent_id}</span>
                              <ArrowRight size={14} className="text-muted" />
                              <span className="font-mono text-ink font-bold">{lnk.child_id}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="rounded bg-panel px-2 py-0.5 text-[10px] text-muted">{lnk.type}</span>
                              <span className="font-semibold text-ink">{formatKg(lnk.output_kg)}</span>
                              <button
                                onClick={() => selectBatch(lnk.child_id)}
                                className="text-gold hover:underline text-[11px]"
                              >
                                View Child →
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">This batch has not undergone split or transformation.</p>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 4: Cold-Chain Telemetry */}
              {activeTab === "telemetry" && (
                <div className="space-y-4">
                  {telemetry.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-panel p-8 text-center text-xs text-muted">
                      No environmental telemetry logs recorded for this batch.
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-line bg-panel p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-bold text-ink flex items-center gap-2">
                          <Thermometer size={16} className="text-gold" /> Sensor Temperature Logs
                        </h3>
                        <span className="text-xs text-muted">Perishable limit: 14°C</span>
                      </div>

                      <div className="space-y-2">
                        {telemetry.map((tel) => (
                          <div
                            key={tel.id}
                            className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
                              tel.breach_detected
                                ? "border-quar/50 bg-quar/10 text-quar"
                                : "border-line/60 bg-panel-2 text-ink-2"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className={`h-2.5 w-2.5 rounded-full ${
                                  tel.breach_detected ? "bg-quar animate-pulse" : "bg-clear"
                                }`}
                              />
                              <div>
                                <span className="font-mono font-bold text-ink">{tel.sensor_id}</span>
                                <span className="text-[11px] text-muted ml-2">Shipment {tel.shipment_id}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <span className="font-bold text-base tnum">{tel.temp_c}°C</span>
                                {tel.breach_detected && (
                                  <span className="text-[10px] text-quar font-bold block">BREACH DETECTED</span>
                                )}
                              </div>
                              <span className="text-[11px] text-muted">
                                {new Date(tel.recorded_at).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: Blockchain Records */}
              {activeTab === "blockchain" && (
                <div className="space-y-4">
                  {transactions.length === 0 ? (
                    <div className="rounded-2xl border border-line bg-panel p-8 text-center text-xs text-muted">
                      No transactions sealed on-chain for this batch yet.
                    </div>
                  ) : (
                    transactions.map((tx) => (
                      <div key={tx.id} className="rounded-2xl border border-line bg-panel p-4 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-ink">{tx.id}</span>
                            <span className="rounded bg-panel-2 px-2 py-0.5 text-[11px] text-gold">{tx.stage}</span>
                            <StatusBadge status={tx.ledger_status} />
                          </div>
                          {tx.block_index !== null && tx.block_index !== undefined ? (
                            <Link
                              to={`/admin/ledger`}
                              className="text-gold font-mono hover:underline flex items-center gap-1"
                            >
                              <Boxes size={13} /> Block #{tx.block_index}
                            </Link>
                          ) : (
                            <span className="text-muted">In Mempool Queue</span>
                          )}
                        </div>

                        <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-muted">
                          <div>Seller: <strong className="text-ink">{tx.seller_name}</strong></div>
                          <div>Buyer: <strong className="text-ink">{tx.buyer_name}</strong></div>
                          <div>Quantity: <strong className="text-ink">{formatKg(tx.quantity_kg)}</strong></div>
                          <div>Risk Score: <strong className={tx.risk >= 0.7 ? "text-quar" : "text-clear"}>{(tx.risk * 100).toFixed(0)}%</strong></div>
                        </div>

                        {tx.tx_hash && (
                          <div className="mt-3 rounded-xl bg-panel-2 p-2 font-mono text-[11px] text-muted flex items-center justify-between">
                            <span>Record SHA-256: <code className="text-gold">{tx.tx_hash}</code></span>
                            <span className="text-clear flex items-center gap-1"><ShieldCheck size={12} /> Sealed</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-line bg-panel p-8 text-center text-sm text-muted">
              Select a batch from the left to view its complete lifecycle journey.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
