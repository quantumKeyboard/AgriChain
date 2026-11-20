import { AlertCircle, AlertTriangle, Boxes, ShieldCheck, Truck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParticipantBatches, useTransferDispatch } from "../../api/hooks";
import type { BatchResponse } from "../../api/types";
import { useApp } from "../../state/AppState";

export interface TransferModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  batchId?: string;
  preselectedBatch?: BatchResponse | null;
  senderId?: string;
  availableKg?: number;
  stage?: string;
  defaultReceiver?: string;
}

// Stage configuration mapping by Sender Role and Receiver
interface RecipientOption {
  id: string;
  name: string;
  stage: string;
  stageLabel: string;
}

const RECIPIENT_OPTIONS_BY_ROLE: Record<string, RecipientOption[]> = {
  FARMER: [
    {
      id: "C-001",
      name: "Solapur Agro-Cooperative (C-001)",
      stage: "FARM_TO_COOP",
      stageLabel: "Farm Gate → Cooperative Mandi (FARM_TO_COOP)",
    },
    {
      id: "P-001",
      name: "AgroPack Foods Processing (P-001)",
      stage: "COOP_TO_PROCESSOR",
      stageLabel: "Direct Farm → Processing Plant (COOP_TO_PROCESSOR)",
    },
  ],
  COOP: [
    {
      id: "P-001",
      name: "AgroPack Foods Processing (P-001)",
      stage: "COOP_TO_PROCESSOR",
      stageLabel: "Cooperative Intake → Processor (COOP_TO_PROCESSOR)",
    },
    {
      id: "D-001",
      name: "ColdTrans Logistics (D-001)",
      stage: "PROCESSOR_TO_DISTRIBUTOR",
      stageLabel: "Cooperative → Cold Chain Logistics (PROCESSOR_TO_DISTRIBUTOR)",
    },
  ],
  PROCESSOR: [
    {
      id: "D-001",
      name: "ColdTrans Logistics (D-001)",
      stage: "PROCESSOR_TO_DISTRIBUTOR",
      stageLabel: "Processing Plant → Distribution Hub (PROCESSOR_TO_DISTRIBUTOR)",
    },
    {
      id: "R-001",
      name: "FreshMart Organics (R-001)",
      stage: "DISTRIBUTOR_TO_RETAILER",
      stageLabel: "Direct Processor → Retail Supermarket (DISTRIBUTOR_TO_RETAILER)",
    },
  ],
  DISTRIBUTOR: [
    {
      id: "R-001",
      name: "FreshMart Organics (R-001)",
      stage: "DISTRIBUTOR_TO_RETAILER",
      stageLabel: "Distribution Center → Retail Store (DISTRIBUTOR_TO_RETAILER)",
    },
  ],
};

const DEFAULT_FALLBACK_RECIPIENTS: RecipientOption[] = [
  {
    id: "C-001",
    name: "Solapur Agro-Cooperative (C-001)",
    stage: "FARM_TO_COOP",
    stageLabel: "Farm → Cooperative (FARM_TO_COOP)",
  },
  {
    id: "P-001",
    name: "AgroPack Foods Processing (P-001)",
    stage: "COOP_TO_PROCESSOR",
    stageLabel: "Cooperative → Processor (COOP_TO_PROCESSOR)",
  },
  {
    id: "D-001",
    name: "ColdTrans Logistics (D-001)",
    stage: "PROCESSOR_TO_DISTRIBUTOR",
    stageLabel: "Processor → Logistics (PROCESSOR_TO_DISTRIBUTOR)",
  },
  {
    id: "R-001",
    name: "FreshMart Organics (R-001)",
    stage: "DISTRIBUTOR_TO_RETAILER",
    stageLabel: "Logistics → Retail (DISTRIBUTOR_TO_RETAILER)",
  },
];

export function TransferModal({
  open,
  isOpen,
  onClose,
  batchId,
  preselectedBatch,
  senderId,
  availableKg,
  stage: stageProp,
  defaultReceiver,
}: TransferModalProps) {
  const isModalOpen = open ?? isOpen ?? false;
  const { pushToast, activeUser } = useApp();
  const dispatchMutation = useTransferDispatch();
  const { data: allBatches } = useParticipantBatches();

  const role = activeUser?.role || "FARMER";
  const recipientOptions = RECIPIENT_OPTIONS_BY_ROLE[role] || DEFAULT_FALLBACK_RECIPIENTS;

  // Filter batches held by current user with positive quantity
  const eligibleBatches = useMemo(() => {
    if (!allBatches) return [];
    return allBatches.filter(
      (b) =>
        b.status === "ACTIVE" &&
        (b.current_quantity_kg ?? b.current_quantity ?? 0) > 0
    );
  }, [allBatches]);

  // Selected batch resolution
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [receiverId, setReceiverId] = useState<string>("");
  const [quantityKg, setQuantityKg] = useState<number>(3000);
  const [vehicleNumber, setVehicleNumber] = useState("MH-14-TR-8421");
  const [transitKm, setTransitKm] = useState(85);
  const [unitPrice, setUnitPrice] = useState(38);
  const [notes, setNotes] = useState("Dispatched via refrigerated container");

  // Sync state whenever modal opens or props change
  useEffect(() => {
    if (!isModalOpen) return;

    // Determine initial batch ID
    let initialBatchId = batchId || preselectedBatch?.id || "";
    if (!initialBatchId && eligibleBatches.length > 0) {
      initialBatchId = eligibleBatches[0].id;
    }
    setSelectedBatchId(initialBatchId);

    // Determine initial receiver & stage
    const initialReceiver = defaultReceiver || recipientOptions[0]?.id || "C-001";
    setReceiverId(initialReceiver);

    // Determine available quantity
    const matchingBatch =
      eligibleBatches.find((b) => b.id === initialBatchId) ||
      preselectedBatch ||
      null;

    const avail =
      availableKg ??
      matchingBatch?.current_quantity_kg ??
      matchingBatch?.current_quantity ??
      (initialBatchId ? 4000 : 0);

    setQuantityKg(avail > 0 ? avail : 1000);
  }, [isModalOpen, batchId, preselectedBatch, availableKg, eligibleBatches, defaultReceiver, recipientOptions]);

  if (!isModalOpen) return null;

  // Find currently active batch details
  const currentBatch =
    eligibleBatches.find((b) => b.id === selectedBatchId) ||
    preselectedBatch ||
    (allBatches || []).find((b) => b.id === selectedBatchId) ||
    null;

  const effectiveAvailableKg =
    availableKg ??
    currentBatch?.current_quantity_kg ??
    currentBatch?.current_quantity ??
    0;

  // Current recipient & stage info
  const selectedRecipient = recipientOptions.find((r) => r.id === receiverId) || recipientOptions[0];
  const effectiveStage = stageProp || selectedRecipient?.stage || "FARM_TO_COOP";
  const stageDisplayLabel = selectedRecipient?.stageLabel || effectiveStage;

  const effectiveSenderId =
    senderId ||
    currentBatch?.current_holder_id ||
    activeUser?.participant_id ||
    "F-001";

  // Quantity validation
  const isOverQuantity = effectiveAvailableKg > 0 && quantityKg > effectiveAvailableKg;
  const isInvalidQuantity = quantityKg <= 0 || isNaN(quantityKg);
  const totalValue = Math.round(Number(quantityKg || 0) * Number(unitPrice || 0));

  const handleBatchChange = (newBatchId: string) => {
    setSelectedBatchId(newBatchId);
    const found = eligibleBatches.find((b) => b.id === newBatchId);
    if (found) {
      const avail = found.current_quantity_kg ?? found.current_quantity ?? 0;
      setQuantityKg(avail);
    }
  };

  const handleSetMax = () => {
    if (effectiveAvailableKg > 0) {
      setQuantityKg(effectiveAvailableKg);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBatchId) {
      pushToast({
        tone: "danger",
        title: "Missing Batch Selection",
        body: "Please select an active batch to dispatch.",
      });
      return;
    }

    if (isOverQuantity) {
      pushToast({
        tone: "danger",
        title: "Quantity Exceeds Inventory",
        body: `Cannot dispatch ${quantityKg.toLocaleString()} kg from an available inventory of ${effectiveAvailableKg.toLocaleString()} kg.`,
      });
      return;
    }

    try {
      const res = await dispatchMutation.mutateAsync({
        batch_id: selectedBatchId,
        sender_id: effectiveSenderId,
        receiver_id: receiverId,
        stage: effectiveStage,
        quantity_kg: Number(quantityKg),
        vehicle_number: vehicleNumber,
        transit_km: Number(transitKm),
        unit_price: Number(unitPrice),
        notes,
      });

      pushToast({
        tone: "ok",
        title: "Transfer Dispatched & Signed",
        body: `Transfer ${res.transfer_id} initiated (${quantityKg.toLocaleString()} kg)`,
      });
      onClose();
    } catch (err) {
      pushToast({
        tone: "danger",
        title: "Dispatch Failed",
        body: (err as Error).message,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-gold/15 p-2 text-gold">
              <Truck size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-ink">Initiate Outward Transfer</h2>
              <span className="text-[11px] text-muted">Two-sided custody handoff with Ed25519 digital signature</span>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Batch Selection Card */}
          <div className="rounded-2xl border border-line bg-panel-2 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-muted block text-[11px] font-semibold flex items-center gap-1.5">
                <Boxes size={13} className="text-gold" />
                Select Batch for Consignment
              </label>
              <div className="text-right">
                <span className="text-[10px] text-muted block">Available Inventory</span>
                <span className="font-mono font-bold text-gold text-xs">
                  {effectiveAvailableKg > 0 ? `${effectiveAvailableKg.toLocaleString()} kg` : "0 kg"}
                </span>
              </div>
            </div>

            {/* If batchId was preselected by clicking a specific batch, show locked card */}
            {batchId ? (
              <div className="rounded-xl bg-panel border border-line p-2.5 flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold text-ink text-xs block">{batchId}</span>
                  {currentBatch && (
                    <span className="text-[11px] text-muted capitalize">
                      {currentBatch.crop} · {currentBatch.variety || "Standard"}
                    </span>
                  )}
                </div>
                <span className="rounded-full bg-gold/15 border border-gold/30 px-2 py-0.5 text-[10px] font-bold text-gold">
                  Selected
                </span>
              </div>
            ) : eligibleBatches.length > 0 ? (
              /* If opened from global button, provide clean dropdown of user's active batches */
              <div>
                <select
                  value={selectedBatchId}
                  onChange={(e) => handleBatchChange(e.target.value)}
                  className="w-full rounded-xl border border-line bg-panel p-2.5 text-ink text-xs focus:border-gold focus:outline-none font-mono"
                >
                  {eligibleBatches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.id} — {b.crop.toUpperCase()} ({((b.current_quantity_kg ?? b.current_quantity) || 0).toLocaleString()} kg)
                    </option>
                  ))}
                </select>
                {currentBatch && (
                  <p className="mt-1.5 text-[11px] text-muted flex items-center gap-2">
                    <span>Variety: <strong className="text-ink">{currentBatch.variety || "Standard"}</strong></span>
                    <span>·</span>
                    <span>Location: <strong className="text-ink">{currentBatch.farm_location || currentBatch.region || "Local"}</strong></span>
                  </p>
                )}
              </div>
            ) : (
              /* No eligible batches in inventory */
              <div className="rounded-xl bg-quar/10 border border-quar/30 p-2.5 text-quar flex items-center gap-2">
                <AlertCircle size={15} className="shrink-0" />
                <span className="text-[11px]">
                  No active batches with available quantity found in your inventory. Register a harvest first.
                </span>
              </div>
            )}
          </div>

          {/* Recipient Organization & Stage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Recipient Organization</label>
              <select
                value={receiverId}
                onChange={(e) => {
                  const newReceiver = e.target.value;
                  setReceiverId(newReceiver);
                }}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink text-xs focus:border-gold focus:outline-none"
              >
                {recipientOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-muted block mb-1 font-semibold">Transfer Stage</label>
              <div className="w-full rounded-xl border border-line bg-panel-2/70 p-2.5 text-xs text-ink flex items-center gap-1.5">
                <Truck size={13} className="text-gold shrink-0" />
                <span className="truncate text-muted font-medium">{stageDisplayLabel}</span>
              </div>
            </div>
          </div>

          {/* Quantities & Pricing */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-muted font-semibold">Dispatched Quantity (kg)</label>
                {effectiveAvailableKg > 0 && (
                  <button
                    type="button"
                    onClick={handleSetMax}
                    className="text-[10px] text-gold font-bold hover:underline"
                  >
                    Max ({effectiveAvailableKg.toLocaleString()} kg)
                  </button>
                )}
              </div>
              <input
                type="number"
                min="1"
                max={effectiveAvailableKg || 500000}
                value={quantityKg}
                onChange={(e) => setQuantityKg(Number(e.target.value))}
                className={`w-full rounded-xl border p-2.5 text-ink focus:outline-none font-bold text-xs ${
                  isOverQuantity
                    ? "border-quar bg-quar/10 text-quar"
                    : "border-line bg-panel-2 focus:border-gold"
                }`}
              />
            </div>

            <div>
              <label className="text-muted block mb-1 font-semibold">Unit Price (₹/kg)</label>
              <input
                type="number"
                step="0.5"
                min="1"
                value={unitPrice}
                onChange={(e) => setUnitPrice(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none font-bold text-xs"
              />
            </div>
          </div>

          {/* Quantity Validation Warning */}
          {isOverQuantity && (
            <div className="rounded-xl bg-quar/15 border border-quar/40 p-2 text-quar flex items-center gap-1.5 text-[11px]">
              <AlertTriangle size={13} className="shrink-0" />
              <span>Cannot dispatch more than available inventory ({effectiveAvailableKg.toLocaleString()} kg).</span>
            </div>
          )}

          {/* Consignment Total Value */}
          <div className="rounded-xl border border-line bg-panel-2 p-2.5 flex items-center justify-between text-xs">
            <span className="text-muted">Total Consignment Value:</span>
            <span className="font-bold text-ink font-mono text-sm">
              ₹{totalValue.toLocaleString("en-IN")}
            </span>
          </div>

          {/* Logistics & Vehicle */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Vehicle / Container No.</label>
              <input
                type="text"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. MH-14-TR-8421"
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Distance (km)</label>
              <input
                type="number"
                min="1"
                value={transitKm}
                onChange={(e) => setTransitKm(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none text-xs"
              />
            </div>
          </div>

          {/* Dispatch Notes */}
          <div>
            <label className="text-muted block mb-1 font-semibold">Dispatch Notes / Telemetry Spec</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Reefer container maintained at 4.2°C"
              className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none text-xs"
            />
          </div>

          {/* Digital Signature Disclaimer */}
          <div className="flex items-center gap-2 text-[11px] text-muted border-t border-line pt-3 pb-2">
            <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
            <span>Digital signature will be generated using {activeUser?.name || "Sender"}'s Ed25519 private key.</span>
          </div>

          {/* Sticky Actions Footer */}
          <div className="sticky bottom-0 bg-panel border-t border-line/60 pt-3 flex items-center justify-end gap-3 -mx-6 -mb-6 px-6 pb-6 rounded-b-3xl mt-2">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={dispatchMutation.isPending || isOverQuantity || isInvalidQuantity || !selectedBatchId}
              className="btn-gold px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow"
            >
              {dispatchMutation.isPending ? "Signing & Dispatching..." : "Sign & Dispatch Transfer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
