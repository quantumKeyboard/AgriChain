import {
  AlertOctagon,
  AlertTriangle,
  RefreshCw,
  Repeat,
  Scale,
  ShieldAlert,
  Snowflake,
  TrendingUp,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useFraudCenter } from "../api/hooks";
import { formatKg } from "../lib/format";
import { StatusBadge } from "../components/ui";

const FRAUD_ICONS: Record<string, typeof AlertTriangle> = {
  phantom_quantity: Scale,
  price_manipulation: TrendingUp,
  cold_chain_concealed: Snowflake,
  organic_label_fraud: AlertOctagon,
  circular_trading: Repeat,
  duplicate_invoice: AlertTriangle,
  forged_signature: ShieldAlert,
};

export default function FraudCenter() {
  const { data: fraudData, isLoading, refetch } = useFraudCenter();

  const categories = fraudData?.categories || [];
  const highRiskCases = fraudData?.recent_high_risk_cases || [];

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-muted">Loading fraud intelligence matrix...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Fraud Intelligence Center</h1>
            <span className="rounded-full bg-quar/15 px-2.5 py-0.5 text-xs font-semibold text-quar">
              Real-Time AI & Rule Threat Matrix
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            Continuous surveillance across 6 agricultural fraud vectors plus cryptographic identity enforcement.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/admin/quarantine"
            className="btn-gold flex items-center gap-1.5 px-3 py-2 text-xs"
          >
            <ShieldAlert size={14} /> Open Quarantine Queue ({fraudData?.total_quarantined || 0})
          </Link>
          <button onClick={() => refetch()} className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {/* Fraud Vectors Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((cat) => {
          const Icon = FRAUD_ICONS[cat.category] || AlertTriangle;
          return (
            <div
              key={cat.category}
              className="rounded-2xl border border-line bg-panel p-4 flex flex-col justify-between space-y-3"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-xl bg-quar/15 p-2.5 text-quar">
                    <Icon size={18} />
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                      cat.severity_level === "CRITICAL" ? "bg-quar/20 text-quar" : "bg-amber-500/20 text-amber-400"
                    }`}
                  >
                    {cat.severity_level}
                  </span>
                </div>
                <h3 className="mt-3 text-sm font-bold text-ink">{cat.label}</h3>
                <p className="mt-1 text-xs text-muted leading-relaxed">{cat.description}</p>
              </div>

              <div className="pt-3 border-t border-line flex items-center justify-between">
                <span className="text-xs text-muted">Incidents Detected:</span>
                <span className="text-lg font-bold text-quar tnum">{cat.total_detected}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent High-Risk Incidents Table */}
      <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-bold text-ink">Recent High-Risk Ingest Cases</h2>
            <p className="text-xs text-muted">Transactions triggering critical risk scores (≥ 0.70) or hard cryptographic quarantine.</p>
          </div>
          <span className="text-xs text-muted">Sorted by newest detection</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="pb-2.5 font-medium">Transaction ID</th>
                <th className="pb-2.5 font-medium">Batch ID</th>
                <th className="pb-2.5 font-medium">Predicted Threat</th>
                <th className="pb-2.5 font-medium">Quantity</th>
                <th className="pb-2.5 font-medium">Risk Score</th>
                <th className="pb-2.5 font-medium">Status</th>
                <th className="pb-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/40">
              {highRiskCases.map((c) => (
                <tr key={c.tx_id} className="hover:bg-panel-2/50 transition">
                  <td className="py-3 font-mono font-bold text-ink">{c.tx_id}</td>
                  <td className="py-3 font-mono text-gold">
                    <Link to={`/admin/lifecycle?id=${c.batch_id}`} className="hover:underline">
                      {c.batch_id}
                    </Link>
                  </td>
                  <td className="py-3">
                    <span className="font-semibold text-quar">{c.pred_label}</span>
                    {c.rule_hits && c.rule_hits.length > 0 && (
                      <span className="block text-[11px] text-muted truncate max-w-xs">
                        {c.rule_hits[0].reason}
                      </span>
                    )}
                  </td>
                  <td className="py-3 font-mono text-ink">{formatKg(c.quantity_kg)}</td>
                  <td className="py-3">
                    <span className="font-bold text-quar tnum">{(c.risk * 100).toFixed(0)}%</span>
                  </td>
                  <td className="py-3">
                    <StatusBadge status={c.decision} />
                  </td>
                  <td className="py-3 text-right">
                    <Link
                      to={`/admin/quarantine`}
                      className="text-gold font-semibold hover:underline"
                    >
                      Investigate →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
