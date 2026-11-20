import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Filter,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useState } from "react";
import {
  useIncomingTransfers,
  useOutgoingTransfers,
} from "../api/hooks";
import type { TransferResponse } from "../api/types";
import { ReceiveModal } from "../components/modals/ReceiveModal";
import { TransferModal } from "../components/modals/TransferModal";
import { formatCryptoHash, formatKg } from "../lib/format";
import { useApp } from "../state/AppState";

export default function ParticipantTransfers() {
  const { activeUser } = useApp();
  const role = activeUser?.role || "FARMER";

  const {
    data: incoming,
    isLoading: inLoading,
    refetch: refetchIn,
  } = useIncomingTransfers();
  const {
    data: outgoing,
    isLoading: outLoading,
    refetch: refetchOut,
  } = useOutgoingTransfers();

  const [activeTab, setActiveTab] = useState<"incoming" | "outgoing">(
    role === "FARMER" ? "outgoing" : "incoming"
  );
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  // Modals state
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<TransferResponse | null>(null);

  if (!activeUser) return null;

  const currentList = activeTab === "incoming" ? incoming || [] : outgoing || [];

  const filteredList = currentList.filter((trf) => {
    const matchStatus = statusFilter === "ALL" || trf.status === statusFilter;
    const matchSearch =
      search === "" ||
      trf.id.toLowerCase().includes(search.toLowerCase()) ||
      trf.batch_id.toLowerCase().includes(search.toLowerCase()) ||
      trf.sender_id.toLowerCase().includes(search.toLowerCase()) ||
      trf.receiver_id.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const handleRefetch = () => {
    refetchIn();
    refetchOut();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Truck size={22} className="text-gold" /> Handoff & Dispatch Management
          </h1>
          <p className="mt-1 text-xs text-muted">
            Track two-sided custody transfers, weighbridge reconciliation, and signed handoffs for{" "}
            <strong className="text-ink">{activeUser.name}</strong>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {role !== "RETAILER" && (
            <button
              onClick={() => setTransferOpen(true)}
              className="btn-gold flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-md"
            >
              <Plus size={15} /> Create Outward Dispatch
            </button>
          )}
          <button onClick={handleRefetch} className="btn-ghost px-3 py-2 text-xs" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3 border-b border-line pb-2">
        <button
          onClick={() => setActiveTab("incoming")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === "incoming"
              ? "bg-gold text-gold-ink shadow-md"
              : "bg-panel text-muted hover:text-ink"
          }`}
        >
          <ArrowDownLeft size={16} /> Incoming Handoffs
          {incoming && incoming.filter((t) => t.status === "IN_TRANSIT").length > 0 && (
            <span className="rounded-full bg-quar px-2 py-0.5 text-[10px] text-white font-bold ml-1">
              {incoming.filter((t) => t.status === "IN_TRANSIT").length} pending
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("outgoing")}
          className={`flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl transition ${
            activeTab === "outgoing"
              ? "bg-gold text-gold-ink shadow-md"
              : "bg-panel text-muted hover:text-ink"
          }`}
        >
          <ArrowUpRight size={16} /> Outward Dispatches ({outgoing?.length || 0})
        </button>
      </div>

      {/* Search and Filters */}
      <div className="rounded-2xl border border-line bg-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${activeTab} by Transfer ID, Batch ID, or Partner...`}
            className="w-full rounded-xl border border-line bg-panel-2 pl-9 pr-4 py-2 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter size={14} className="text-muted" />
          <span className="text-xs text-muted">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DISPUTED">Disputed</option>
          </select>
        </div>
      </div>

      {/* Transfer List Table */}
      {inLoading || outLoading ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center text-xs text-muted">
          Loading transfers...
        </div>
      ) : filteredList.length === 0 ? (
        <div className="rounded-2xl border border-line bg-panel p-12 text-center text-xs text-muted space-y-2">
          <p className="font-semibold text-ink">No {activeTab} transfers found.</p>
          <p className="text-xs">
            {activeTab === "incoming"
              ? "When upstream organizations dispatch goods to you, they will appear here for weighbridge verification."
              : "Use 'Create Outward Dispatch' above to send produce to downstream partners."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((trf) => {
            const hasDiscrepancy =
              trf.discrepancy_kg !== null &&
              trf.discrepancy_kg !== undefined &&
              Math.abs(trf.discrepancy_kg) > 0.01;

            return (
              <div
                key={trf.id}
                className="rounded-2xl border border-line bg-panel p-5 transition hover:border-line-2 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono font-bold text-gold text-sm">{trf.id}</span>
                    <span className="rounded bg-panel-2 px-2.5 py-0.5 text-ink font-semibold">
                      Batch: {trf.batch_id}
                    </span>
                    <span
                      className={`rounded px-2.5 py-0.5 font-bold ${
                        trf.status === "ACCEPTED"
                          ? "bg-clear/20 text-clear"
                          : trf.status === "IN_TRANSIT"
                            ? "bg-amber-500/20 text-amber-400"
                            : "bg-quar/20 text-quar"
                      }`}
                    >
                      {trf.status}
                    </span>
                    {trf.vehicle_number && (
                      <span className="rounded bg-panel-2 border border-line px-2 py-0.5 text-[11px] text-muted">
                        Vehicle: {trf.vehicle_number}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                    <div>
                      <span className="text-[10px] text-muted block">From (Sender)</span>
                      <strong className="text-ink font-mono">{trf.sender_id}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">To (Receiver)</span>
                      <strong className="text-ink font-mono">{trf.receiver_id}</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">Dispatched Qty</span>
                      <span className="text-ink font-mono font-bold">
                        {formatKg(trf.dispatched_quantity_kg)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-muted block">Received Qty</span>
                      <span className="text-ink font-mono font-bold">
                        {trf.received_quantity_kg != null
                          ? formatKg(trf.received_quantity_kg)
                          : "Pending Inward"}
                      </span>
                    </div>
                  </div>

                  {hasDiscrepancy && (
                    <div
                      className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                        trf.status === "DISPUTED"
                          ? "bg-quar/15 text-quar border border-quar/30"
                          : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                      }`}
                    >
                      <AlertTriangle size={14} />
                      <span>
                        Discrepancy: {trf.discrepancy_kg! > 0 ? "+" : ""}
                        {trf.discrepancy_kg} kg
                        {trf.dispatched_quantity_kg > 0 &&
                          ` (${((Math.abs(trf.discrepancy_kg) / trf.dispatched_quantity_kg) * 100).toFixed(1)}%)`}
                      </span>
                      {trf.dispute_reason && (
                        <span className="text-muted">· Reason: {trf.dispute_reason}</span>
                      )}
                    </div>
                  )}

                  {/* Signatures */}
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted pt-1">
                    <span className="flex items-center gap-1 font-mono">
                      <ShieldCheck size={12} className="text-emerald-400" />
                      Sender Sig: {trf.sender_signature ? formatCryptoHash(trf.sender_signature) : "Signed"}
                    </span>
                    {trf.receiver_signature && (
                      <span className="flex items-center gap-1 font-mono">
                        <ShieldCheck size={12} className="text-emerald-400" />
                        Receiver Sig: {formatCryptoHash(trf.receiver_signature)}
                      </span>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="flex md:flex-col items-end justify-center gap-2 shrink-0">
                  {activeTab === "incoming" && trf.status === "IN_TRANSIT" && (
                    <button
                      onClick={() => {
                        setSelectedTransfer(trf);
                        setReceiveOpen(true);
                      }}
                      className="btn-gold flex items-center gap-2 px-4 py-2 text-xs font-bold shadow-md whitespace-nowrap"
                    >
                      <Scale size={15} /> Weigh & Respond
                    </button>
                  )}

                  {trf.status === "ACCEPTED" && (
                    <span className="flex items-center gap-1 text-clear font-semibold text-xs">
                      <CheckCircle2 size={15} /> Handover Complete
                    </span>
                  )}

                  {trf.status === "DISPUTED" && (
                    <span className="flex items-center gap-1 text-quar font-semibold text-xs">
                      <AlertTriangle size={15} /> Flagged in Dispute
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <ReceiveModal
        open={receiveOpen}
        onClose={() => {
          setReceiveOpen(false);
          setSelectedTransfer(null);
        }}
        transfer={selectedTransfer}
      />
      <TransferModal
        open={transferOpen}
        onClose={() => {
          setTransferOpen(false);
        }}
      />
    </div>
  );
}
