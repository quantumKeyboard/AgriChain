import { KeyRound, Link2, Route, X } from "lucide-react";
import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTransaction } from "../api/hooks";
import type { TxView } from "../api/types";
import { CROP_EMOJI, STAGE_LABEL, cap, clock, inr, kg } from "../lib/format";
import { RuleList, ScoreBreakdown, ShapBars } from "./Explain";
import { RiskSun } from "./RiskSun";
import { ErrorBox, Loading, StatusBadge } from "./ui";

export function TxDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading, error, refetch } = useTransaction(id);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <aside
        role="dialog"
        aria-label={`Transaction ${id}`}
        className="slide-in scroll-thin h-full w-full max-w-xl overflow-y-auto border-l border-line bg-panel p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <p className="font-mono text-sm text-muted">{id}</p>
          <button onClick={onClose} className="btn-ghost p-2" aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {isLoading && <Loading />}
        {error && <ErrorBox error={error} onRetry={refetch} />}
        {data && <TxDetail tx={data} />}
      </aside>
    </div>
  );
}

export function TxDetail({ tx, compact = false }: { tx: TxView; compact?: boolean }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-5">
        <RiskSun risk={tx.risk} size={compact ? 130 : 150} />
        <div className="min-w-0 space-y-2">
          <p className="text-2xl font-light text-ink">
            {CROP_EMOJI[tx.crop]} {cap(tx.crop)} · {kg(tx.quantity_kg)}
          </p>
          <p className="text-sm text-ink-2">{STAGE_LABEL[tx.stage]}</p>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={tx.decision} />
            <StatusBadge status={tx.ledger_status} />
          </div>
          {tx.pred_type !== "none" && (
            <p className="text-xs text-muted">
              Model suspects: <span className="font-semibold text-gold">{tx.pred_label}</span>
            </p>
          )}
          {tx.sim_label_display && (
            <p className="text-[11px] text-muted">Simulator ground truth: {tx.sim_label_display}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Info k="Seller" v={`${tx.seller_name} (${tx.seller_id})`} />
        <Info k="Buyer" v={`${tx.buyer_name} (${tx.buyer_id})`} />
        <Info k="Unit price" v={`${inr(tx.unit_price)}/kg · ref ${inr(tx.ref_price)}`} />
        <Info k="Total value" v={inr(tx.total_value, 0)} />
        <Info k="Transit" v={`${tx.transit_km} km in ${tx.transit_hours} h`} />
        <Info
          k="Temperature"
          v={`avg ${tx.temp_avg_c}°C · max ${tx.temp_max_c}°C${tx.cold_chain_ok_claimed ? " · 'cold chain OK'" : ""}`}
        />
        <Info
          k="Organic"
          v={
            tx.organic_claimed
              ? tx.organic_cert_valid
                ? "Claimed · certified"
                : "Claimed · NO certificate"
              : "No"
          }
        />
        <Info k="Payment · grade" v={`${tx.payment_mode} · Grade ${tx.quality_grade}`} />
        <Info k="Time" v={clock(tx.timestamp)} />
        <Info k="Batch" v={tx.batch_id} />
      </div>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Why — rule engine</h4>
        <RuleList hits={tx.rule_hits} />
      </section>
      {tx.shap_top && tx.shap_top.length > 0 && (
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
            Why — model (SHAP)
          </h4>
          <ShapBars items={tx.shap_top} />
        </section>
      )}
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Hybrid score</h4>
        <ScoreBreakdown p={tx.p_fraud} rules={tx.rule_score} anomaly={tx.anomaly_score} />
      </section>

      <section className="card-inner space-y-1.5 p-4 text-xs">
        <p className="flex items-center gap-2 font-semibold text-ink-2">
          <Link2 size={14} className="text-gold" /> On-chain record
        </p>
        {tx.block_index !== null ? (
          <>
            <p className="text-muted">
              Sealed in{" "}
              <Link
                to={`/ledger?block=${tx.block_index}`}
                className="text-gold underline-offset-2 hover:underline"
              >
                block #{tx.block_index}
              </Link>{" "}
              as <span className="text-ink-2">{tx.ledger_status}</span>
            </p>
            <p className="break-all font-mono text-[11px] text-muted">{tx.tx_hash}</p>
          </>
        ) : (
          <p className="text-muted">
            {tx.ledger_status === "PENDING_REVIEW"
              ? "Held in quarantine — not on chain until an auditor decides."
              : "Waiting in the mempool for the next block."}
          </p>
        )}
        <SignatureLine tx={tx} />
        {tx.review && (
          <p className="text-muted">
            Auditor: <span className="text-ink-2">{tx.review.action}</span> — “{tx.review.note || "no note"}”
          </p>
        )}
        <Link
          to={`/trace?batch=${tx.batch_id}`}
          className="inline-flex items-center gap-1 pt-1 text-gold hover:underline"
        >
          <Route size={12} /> Trace this batch
        </Link>
      </section>
    </div>
  );
}

function Info({ k, v }: { k: string; v: string }) {
  return (
    <div className="card-inner px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{k}</p>
      <p className="mt-0.5 truncate text-ink-2" title={v}>
        {v}
      </p>
    </div>
  );
}

/** Seller's Ed25519 signature status. */
export function SignatureLine({ tx }: { tx: TxView }) {
  return (
    <p className={`flex items-start gap-1.5 ${tx.signature_valid ? "text-clear-ink" : "text-quar-ink"}`}>
      <KeyRound size={13} className="mt-0.5 shrink-0" aria-hidden />
      <span>
        {tx.signature_valid
          ? "Seller signature valid (Ed25519)"
          : "Signature does NOT match the seller's registered key"}
        <span className="block font-mono text-[10px] text-muted">
          sig {tx.signature ? `${tx.signature.slice(0, 16)}…` : "—"} · key{" "}
          {tx.seller_public_key ? `${tx.seller_public_key.slice(0, 12)}…` : "—"}
        </span>
      </span>
    </p>
  );
}
