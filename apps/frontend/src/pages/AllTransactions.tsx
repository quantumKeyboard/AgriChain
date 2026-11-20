import {
  Download,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { exportUrl } from "../api/client";
import { useTransactions } from "../api/hooks";
import type { TxView } from "../api/types";
import { TxDrawer } from "../components/TxDrawer";
import { StatusBadge } from "../components/ui";
import { formatKg, formatRupees } from "../lib/format";

export default function AllTransactions() {
  const [limit, setLimit] = useState(50);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [cropFilter, setCropFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [selectedTx, setSelectedTx] = useState<TxView | null>(null);

  const { data: txs, isLoading, refetch } = useTransactions({ limit });

  const filteredTxs = (txs || []).filter((tx) => {
    if (statusFilter !== "ALL" && tx.ledger_status !== statusFilter && tx.decision !== statusFilter) {
      return false;
    }
    if (cropFilter !== "ALL" && tx.crop.toLowerCase() !== cropFilter.toLowerCase()) {
      return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        tx.id.toLowerCase().includes(q) ||
        tx.batch_id.toLowerCase().includes(q) ||
        tx.seller_name.toLowerCase().includes(q) ||
        tx.buyer_name.toLowerCase().includes(q) ||
        tx.crop.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">All Supply-Chain Transactions</h1>
          <p className="mt-1 text-sm text-muted">
            Complete transaction ledger: inspect raw submissions, extracted features, model probabilities, and cryptographic signatures.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={exportUrl("transactions.csv")}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
            download
          >
            <Download size={14} /> Export CSV
          </a>
          <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="rounded-2xl border border-line bg-panel p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-2.5 text-muted" size={14} />
            <input
              type="text"
              placeholder="Search by ID, Batch, Seller, Buyer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-line bg-panel-2 py-2 pl-9 pr-3 text-xs text-ink placeholder:text-muted focus:border-gold focus:outline-none"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="COMMITTED">Committed (Clean)</option>
            <option value="FLAGGED">Flagged</option>
            <option value="QUARANTINED">Quarantined</option>
            <option value="APPROVED">Auditor Approved</option>
            <option value="REJECTED">Auditor Rejected</option>
          </select>

          <select
            value={cropFilter}
            onChange={(e) => setCropFilter(e.target.value)}
            className="rounded-xl border border-line bg-panel-2 px-3 py-2 text-xs text-ink focus:border-gold focus:outline-none"
          >
            <option value="ALL">All Crops</option>
            <option value="tomato">Tomato</option>
            <option value="wheat">Wheat</option>
            <option value="rice">Rice</option>
            <option value="soybean">Soybean</option>
            <option value="mango">Mango</option>
            <option value="onion">Onion</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-muted">
          <span>Showing {filteredTxs.length} records</span>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded-xl border border-line bg-panel-2 px-2 py-1.5 text-xs text-ink"
          >
            <option value={30}>30</option>
            <option value={60}>60</option>
            <option value={100}>100</option>
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="rounded-2xl border border-line bg-panel p-5 overflow-hidden">
        {isLoading ? (
          <p className="py-12 text-center text-xs text-muted">Loading transactions...</p>
        ) : filteredTxs.length === 0 ? (
          <p className="py-12 text-center text-xs text-muted">No transactions match your filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line text-muted">
                  <th className="pb-3 font-medium">Tx ID</th>
                  <th className="pb-3 font-medium">Batch ID</th>
                  <th className="pb-3 font-medium">Timestamp</th>
                  <th className="pb-3 font-medium">Seller ➜ Buyer</th>
                  <th className="pb-3 font-medium">Crop & Qty</th>
                  <th className="pb-3 font-medium">Total Value</th>
                  <th className="pb-3 font-medium">Risk</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Signature</th>
                  <th className="pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/40">
                {filteredTxs.map((tx) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="hover:bg-panel-2/60 cursor-pointer transition"
                  >
                    <td className="py-3 font-mono font-bold text-ink">{tx.id}</td>
                    <td className="py-3 font-mono text-gold truncate max-w-[130px]">
                      {tx.batch_id}
                    </td>
                    <td className="py-3 text-muted">
                      {new Date(tx.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-3 text-ink-2">
                      <span className="font-semibold text-ink">{tx.seller_name}</span>
                      <span className="text-muted mx-1">➜</span>
                      <span>{tx.buyer_name}</span>
                    </td>
                    <td className="py-3">
                      <span className="capitalize font-semibold text-ink">{tx.crop}</span>
                      <span className="text-muted ml-1 tnum">({formatKg(tx.quantity_kg)})</span>
                    </td>
                    <td className="py-3 font-mono text-ink tnum">{formatRupees(tx.total_value)}</td>
                    <td className="py-3">
                      <span
                        className={`font-bold tnum ${
                          tx.risk >= 0.70 ? "text-quar" : tx.risk >= 0.40 ? "text-amber-400" : "text-clear"
                        }`}
                      >
                        {(tx.risk * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-3">
                      <StatusBadge status={tx.ledger_status} />
                    </td>
                    <td className="py-3">
                      {tx.signature_valid ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400" title="Valid Ed25519 signature">
                          <ShieldCheck size={13} /> Valid
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] text-quar font-bold" title="Signature verification failed!">
                          <ShieldAlert size={13} /> Forged
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTx(tx);
                        }}
                        className="text-gold hover:underline font-semibold"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Transaction Details Drawer */}
      <TxDrawer id={selectedTx?.id ?? null} onClose={() => setSelectedTx(null)} />
    </div>
  );
}
