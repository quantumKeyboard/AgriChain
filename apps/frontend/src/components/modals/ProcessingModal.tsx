import { Factory, Plus, ShieldCheck, Split, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useProcessingOperation } from "../../api/hooks";
import { useApp } from "../../state/AppState";

export interface ProcessingModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  batchId?: string;
  preselectedBatch?: any;
  processorId?: string;
  availableKg?: number;
}

export function ProcessingModal({
  open,
  isOpen,
  onClose,
  batchId,
  preselectedBatch,
  processorId,
  availableKg,
}: ProcessingModalProps) {
  const { pushToast, activeUser } = useApp();
  const processMutation = useProcessingOperation();

  const effectiveBatchId = batchId || preselectedBatch?.id || "BATCH-001";
  const effectiveProcessorId = processorId || preselectedBatch?.current_holder_id || activeUser?.participant_id || "P-001";
  const effectiveAvailableKg = availableKg ?? preselectedBatch?.current_quantity_kg ?? preselectedBatch?.current_quantity ?? 4000;

  const [operationName, setOperationName] = useState("Aseptic Pulping & Fractionation");
  const [inputQtyKg, setInputQtyKg] = useState(effectiveAvailableKg);
  const [outputs, setOutputs] = useState([
    { name: "Aseptic Fruit Pulp", variety: "Pulp Standard", quantity_kg: Math.round(effectiveAvailableKg * 0.7), quality_grade: "A" },
    { name: "Dehydrated Slices", variety: "Vacuum Dried Slices", quantity_kg: Math.round(effectiveAvailableKg * 0.18), quality_grade: "A" },
  ]);
  const [wasteKg, setWasteKg] = useState(Math.round(effectiveAvailableKg * 0.12));
  const [qualityCert, setQualityCert] = useState("FSSAI/PROC/2026/8941");

  useEffect(() => {
    if (open || isOpen) {
      const avail = availableKg ?? preselectedBatch?.current_quantity_kg ?? preselectedBatch?.current_quantity ?? 4000;
      setInputQtyKg(avail);
      setOutputs([
        { name: "Aseptic Fruit Pulp", variety: "Pulp Standard", quantity_kg: Math.round(avail * 0.7), quality_grade: "A" },
        { name: "Dehydrated Slices", variety: "Vacuum Dried Slices", quantity_kg: Math.round(avail * 0.18), quality_grade: "A" },
      ]);
      setWasteKg(Math.round(avail * 0.12));
    }
  }, [open, isOpen, preselectedBatch, availableKg]);

  if (!(open ?? isOpen ?? false)) return null;

  const totalOutput = outputs.reduce((acc, curr) => acc + Number(curr.quantity_kg || 0), 0);
  const massBalanceDiff = Number(inputQtyKg) - (totalOutput + Number(wasteKg));

  const addOutput = () => {
    setOutputs([...outputs, { name: "By-Product", variety: "Standard", quantity_kg: 100, quality_grade: "B" }]);
  };

  const removeOutput = (index: number) => {
    setOutputs(outputs.filter((_, i) => i !== index));
  };

  const updateOutput = (index: number, field: string, val: any) => {
    const updated = [...outputs];
    updated[index] = { ...updated[index], [field]: val };
    setOutputs(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await processMutation.mutateAsync({
        processor_id: effectiveProcessorId,
        operation_name: operationName,
        input_batch_id: effectiveBatchId,
        input_quantity_kg: Number(inputQtyKg),
        outputs: outputs.map((o) => ({ ...o, quantity_kg: Number(o.quantity_kg) })),
        waste_quantity_kg: Number(wasteKg),
        quality_certificate_ref: qualityCert,
      });

      pushToast({
        tone: "ok",
        title: "Processing Operation Recorded",
        body: `Created ${res.child_batch_ids.length} child batches with linked lineage (Yield: ${res.yield_pct}%)`,
      });
      onClose();
    } catch (err) {
      pushToast({
        tone: "danger",
        title: "Processing Failed",
        body: (err as Error).message,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-xl rounded-3xl border border-line bg-panel p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2">
            <span className="rounded-xl bg-gold/15 p-2 text-gold">
              <Factory size={18} />
            </span>
            <h2 className="text-base font-bold text-ink">Record Processing & Batch Split (Processor)</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="rounded-xl bg-panel-2 p-3 flex justify-between items-center text-xs">
            <div>
              <span className="text-muted block text-[11px]">Parent Raw Batch ID</span>
              <span className="font-mono font-bold text-gold">{effectiveBatchId}</span>
            </div>
            <div className="text-right">
              <span className="text-muted block text-[11px]">Available Raw Quantity</span>
              <span className="font-bold text-ink">{effectiveAvailableKg.toLocaleString()} kg</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Processing Operation Name</label>
              <input
                type="text"
                value={operationName}
                onChange={(e) => setOperationName(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Input Quantity Consumed (kg)</label>
              <input
                type="number"
                value={inputQtyKg}
                onChange={(e) => setInputQtyKg(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none font-bold"
              />
            </div>
          </div>

          {/* Child Outputs List */}
          <div className="space-y-2 border-t border-line pt-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink flex items-center gap-1.5">
                <Split size={14} className="text-gold" /> Finished Product Fractions (Child Batches)
              </span>
              <button
                type="button"
                onClick={addOutput}
                className="text-gold text-xs font-semibold hover:underline flex items-center gap-1"
              >
                <Plus size={13} /> Add Fraction
              </button>
            </div>

            {outputs.map((out, idx) => (
              <div key={idx} className="rounded-xl border border-line bg-panel-2 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gold">Child Lot #{idx + 1} ({effectiveBatchId} Fraction #{idx + 1})</span>
                  {outputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeOutput(idx)}
                      className="text-muted hover:text-quar"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5">Product Name</label>
                    <input
                      type="text"
                      value={out.name}
                      onChange={(e) => updateOutput(idx, "name", e.target.value)}
                      className="w-full rounded-lg border border-line bg-panel p-1.5 text-ink text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5">Quantity (kg)</label>
                    <input
                      type="number"
                      value={out.quantity_kg}
                      onChange={(e) => updateOutput(idx, "quantity_kg", Number(e.target.value))}
                      className="w-full rounded-lg border border-line bg-panel p-1.5 text-ink text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted block mb-0.5">Grade</label>
                    <input
                      type="text"
                      value={out.quality_grade}
                      onChange={(e) => updateOutput(idx, "quality_grade", e.target.value)}
                      className="w-full rounded-lg border border-line bg-panel p-1.5 text-ink text-xs"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Waste & Processing Loss (kg)</label>
              <input
                type="number"
                value={wasteKg}
                onChange={(e) => setWasteKg(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Quality Inspection Cert Ref</label>
              <input
                type="text"
                value={qualityCert}
                onChange={(e) => setQualityCert(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none font-mono"
              />
            </div>
          </div>

          {/* Mass Balance Box */}
          <div className="rounded-xl border border-line bg-panel-2 p-3 text-xs flex justify-between items-center">
            <div>
              <span className="text-muted block">Input Consumed:</span>
              <strong className="text-ink">{inputQtyKg.toLocaleString()} kg</strong>
            </div>
            <div className="text-center">
              <span className="text-muted block">Output + Waste:</span>
              <strong className="text-ink">{(totalOutput + Number(wasteKg)).toLocaleString()} kg</strong>
            </div>
            <div className="text-right">
              <span className="text-muted block">Mass Balance:</span>
              <strong className={massBalanceDiff === 0 ? "text-emerald-400" : "text-amber-400"}>
                {massBalanceDiff === 0 ? "Balanced (100%)" : `${massBalanceDiff > 0 ? "+" : ""}${massBalanceDiff} kg diff`}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted border-t border-line pt-3">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Preserves complete cryptographic lineage from parent harvest to all child fractions.</span>
          </div>

          <div className="sticky bottom-0 bg-panel border-t border-line/60 pt-3 flex items-center justify-end gap-3 -mx-6 -mb-6 px-6 pb-6 rounded-b-3xl">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={processMutation.isPending}
              className="btn-gold px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow"
            >
              {processMutation.isPending ? "Recording Transformation..." : "Record & Split Lineage"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
