import { AlertTriangle, Scale, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTransferRespond } from "../../api/hooks";
import { useApp } from "../../state/AppState";

export interface ReceiveModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  transfer?: {
    id: string;
    batch_id: string;
    sender_name?: string;
    dispatched_quantity_kg?: number;
    dispatched_quantity?: number;
    tolerance_kg?: number;
  } | null;
  receiverId?: string;
}

export function ReceiveModal({
  open,
  isOpen,
  onClose,
  transfer,
  receiverId,
}: ReceiveModalProps) {
  const { pushToast, activeUser } = useApp();
  const respondMutation = useTransferRespond();

  const dispatchedKg = transfer?.dispatched_quantity_kg ?? transfer?.dispatched_quantity ?? 0;
  const toleranceKg = transfer?.tolerance_kg ?? Math.max(50, dispatchedKg * 0.02);

  const [receivedQty, setReceivedQty] = useState<number>(() => dispatchedKg);
  const [action, setAction] = useState<"ACCEPT" | "DISPUTE">("ACCEPT");
  const [disputeReason, setDisputeReason] = useState("");

  useEffect(() => {
    if ((open ?? isOpen ?? false) && transfer) {
      const dKg = transfer.dispatched_quantity_kg ?? transfer.dispatched_quantity ?? 0;
      setReceivedQty(dKg);
      setAction("ACCEPT");
      setDisputeReason("");
    }
  }, [open, isOpen, transfer]);

  if (!(open ?? isOpen ?? false) || !transfer) return null;

  const discrepancy = dispatchedKg - Number(receivedQty || 0);
  const exceedsTolerance = discrepancy > toleranceKg;
  const effectiveReceiverId = receiverId || activeUser?.participant_id || "C-001";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await respondMutation.mutateAsync({
        transferId: transfer.id,
        body: {
          receiver_id: effectiveReceiverId,
          received_quantity_kg: Number(receivedQty),
          action: exceedsTolerance ? "DISPUTE" : action,
          dispute_reason: disputeReason || (exceedsTolerance ? `Weighbridge recorded discrepancy of ${discrepancy} kg` : ""),
        },
      });

      pushToast({
        tone: res.status === "DISPUTED" ? "warn" : "ok",
        title: res.status === "DISPUTED" ? "Transfer Disputed" : "Transfer Accepted & Inwarded",
        body: `Recorded ${receivedQty.toLocaleString()} kg (discrepancy: ${res.discrepancy_kg} kg)`,
      });
      onClose();
    } catch (err) {
      pushToast({
        tone: "danger",
        title: "Inward Reconciliation Failed",
        body: (err as Error).message,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-gold/15 p-2 text-gold">
              <Scale size={18} />
            </span>
            <h2 className="text-base font-bold text-ink">Weighbridge Inward & Reconciliation</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="rounded-xl bg-panel-2 p-3 flex justify-between items-center text-xs">
            <div>
              <span className="text-muted block text-[11px]">Transfer ID</span>
              <span className="font-mono font-bold text-gold">{transfer.id}</span>
              <span className="text-[11px] text-muted block mt-0.5">From: {transfer.sender_name || "Sender"}</span>
            </div>
            <div className="text-right">
              <span className="text-muted block text-[11px]">Declared Dispatched</span>
              <span className="font-bold text-ink text-base">{dispatchedKg.toLocaleString()} kg</span>
            </div>
          </div>

          <div>
            <label className="text-muted block mb-1 font-semibold">
              Actual Received Quantity on Scale (kg)
            </label>
            <input
              type="number"
              step="1"
              value={receivedQty}
              onChange={(e) => setReceivedQty(Number(e.target.value))}
              className="w-full rounded-xl border border-line bg-panel-2 p-3 text-sm text-ink focus:border-gold focus:outline-none font-bold"
            />
          </div>

          {/* Discrepancy & Tolerance Analysis */}
          <div
            className={`rounded-xl p-3 border ${
              exceedsTolerance
                ? "border-red-500/60 bg-red-500/10 text-red-300"
                : "border-line bg-panel-2 text-ink-2"
            }`}
          >
            <div className="flex justify-between items-center">
              <span>Handling Tolerance:</span>
              <strong className="text-ink">±{toleranceKg.toLocaleString()} kg (2.0%)</strong>
            </div>
            <div className="flex justify-between items-center mt-1">
              <span>Calculated Weight Discrepancy:</span>
              <span className={`font-bold ${exceedsTolerance ? "text-red-400 text-sm" : "text-emerald-400"}`}>
                {discrepancy.toFixed(1)} kg {discrepancy > 0 ? "loss" : "gain"}
              </span>
            </div>
            {exceedsTolerance && (
              <p className="mt-2 text-[11px] text-red-400 flex items-center gap-1 font-semibold">
                <AlertTriangle size={13} /> Discrepancy exceeds permissible tolerance limit! This will automatically flag the lifecycle and initiate a dispute.
              </p>
            )}
          </div>

          <div>
            <label className="text-muted block mb-1 font-semibold">Decision Action</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAction("ACCEPT")}
                className={`rounded-xl p-2.5 font-bold transition ${
                  action === "ACCEPT"
                    ? "bg-clear/20 border border-clear text-clear"
                    : "bg-panel-2 border border-line text-muted"
                }`}
              >
                Accept Delivery
              </button>
              <button
                type="button"
                onClick={() => setAction("DISPUTE")}
                className={`rounded-xl p-2.5 font-bold transition ${
                  action === "DISPUTE" || exceedsTolerance
                    ? "bg-red-500/20 border border-red-500 text-red-400"
                    : "bg-panel-2 border border-line text-muted"
                }`}
              >
                Dispute Handoff
              </button>
            </div>
          </div>

          {(action === "DISPUTE" || exceedsTolerance) && (
            <div>
              <label className="text-muted block mb-1 font-semibold">Dispute Explanation / Evidence</label>
              <input
                type="text"
                placeholder="e.g. Weighbridge calibration sheet #402 attached; scale shortage detected"
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
          )}

          <div className="flex items-center gap-2 text-[11px] text-muted border-t border-line pt-3">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Receiver Ed25519 digital signature will confirm actual received weight on the ledger.</span>
          </div>

          <div className="sticky bottom-0 bg-panel border-t border-line/60 pt-3 flex items-center justify-end gap-3 -mx-6 -mb-6 px-6 pb-6 rounded-b-3xl">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={respondMutation.isPending}
              className="btn-gold px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow"
            >
              {respondMutation.isPending ? "Submitting Signature..." : "Sign & Confirm Inward"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
