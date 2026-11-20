import { AlertTriangle, ShieldCheck, Wheat, X } from "lucide-react";
import { useState } from "react";
import { useHarvestBatch } from "../../api/hooks";
import { useApp } from "../../state/AppState";

export interface HarvestModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  farmerId?: string;
  acres?: number;
}

export function HarvestModal({
  open,
  isOpen,
  onClose,
  farmerId,
  acres = 5.0,
}: HarvestModalProps) {
  const { pushToast, activeUser } = useApp();
  const harvestMutation = useHarvestBatch();

  const [crop, setCrop] = useState("mango");
  const [variety, setVariety] = useState("Alphonso Grade-A");
  const [quantityKg, setQuantityKg] = useState(4500);
  const [farmId, setFarmId] = useState("PLOT-A-01");
  const [farmLocation, setFarmLocation] = useState("Solapur South Orchards, Maharashtra");
  const [qualityGrade, setQualityGrade] = useState("A");
  const [organicClaimed, setOrganicClaimed] = useState(true);
  const [organicCertValid, setOrganicCertValid] = useState(true);
  const [certReference, setCertReference] = useState("APEDA/ORG/2026/89421");

  const effectiveFarmerId = farmerId || activeUser?.participant_id || "F-001";

  if (!(open ?? isOpen ?? false)) return null;

  // Expected yield check
  const yieldPerAcre: Record<string, number> = {
    mango: 1200,
    tomato: 8000,
    wheat: 1800,
    rice: 2200,
    soybean: 1100,
    onion: 9000,
  };
  const expectedMaxYield = acres * (yieldPerAcre[crop] || 2000);
  const yieldRatio = quantityKg / Math.max(expectedMaxYield, 1);
  const isPhantomWarning = yieldRatio > 2.5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await harvestMutation.mutateAsync({
        farmer_id: effectiveFarmerId,
        crop,
        quantity_kg: Number(quantityKg),
        farm_id: farmId,
        farm_location: farmLocation,
        variety,
        quality_grade: qualityGrade,
        organic_claimed: organicClaimed,
        organic_cert_valid: organicCertValid,
        cert_reference: certReference,
      });

      pushToast({
        tone: res.is_phantom ? "danger" : "ok",
        title: res.is_phantom ? "Batch Quarantined: Phantom Yield" : "Harvest Batch Registered & Signed",
        body: `Batch ${res.batch_id} created with ${quantityKg.toLocaleString()} kg`,
      });
      onClose();
    } catch (err) {
      pushToast({
        tone: "danger",
        title: "Harvest Registration Failed",
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
              <Wheat size={18} />
            </span>
            <h2 className="text-base font-bold text-ink">Register Harvest Batch (Farmer)</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Crop Category</label>
              <select
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              >
                <option value="mango">Alphonso Mango</option>
                <option value="tomato">Tomato</option>
                <option value="wheat">Wheat</option>
                <option value="rice">Rice (Basmati)</option>
                <option value="soybean">Soybean</option>
                <option value="onion">Red Onion</option>
              </select>
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Variety / Cultivar</label>
              <input
                type="text"
                value={variety}
                onChange={(e) => setVariety(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Harvest Quantity (kg)</label>
              <input
                type="number"
                min="100"
                step="50"
                value={quantityKg}
                onChange={(e) => setQuantityKg(Number(e.target.value))}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none font-bold"
              />
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Quality Grade</label>
              <select
                value={qualityGrade}
                onChange={(e) => setQualityGrade(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              >
                <option value="A">Grade A (Premium)</option>
                <option value="B">Grade B (Standard)</option>
                <option value="C">Grade C (Processing)</option>
              </select>
            </div>
          </div>

          {/* Real-time Yield Plausibility Box */}
          <div
            className={`rounded-xl p-3 border ${
              isPhantomWarning
                ? "border-quar/60 bg-quar/10 text-quar"
                : "border-line bg-panel-2 text-ink-2"
            }`}
          >
            <div className="flex justify-between items-center text-xs">
              <span>Land Capacity ({acres} registered acres):</span>
              <strong className="text-ink">~{expectedMaxYield.toLocaleString()} kg max expected</strong>
            </div>
            <div className="flex justify-between items-center text-xs mt-1">
              <span>Reported vs Expected Yield:</span>
              <span className={`font-bold ${isPhantomWarning ? "text-quar" : "text-emerald-400"}`}>
                {(yieldRatio * 100).toFixed(0)}% ({yieldRatio.toFixed(1)}x)
              </span>
            </div>
            {isPhantomWarning && (
              <p className="mt-2 text-[11px] text-quar flex items-center gap-1 font-medium">
                <AlertTriangle size={13} /> Anomaly: Quantity exceeds 2.5x plausible farm yield! This will trigger an automatic AI Phantom Quantity Quarantine.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-muted block mb-1 font-semibold">Farm Plot ID</label>
              <input
                type="text"
                value={farmId}
                onChange={(e) => setFarmId(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="text-muted block mb-1 font-semibold">Location</label>
              <input
                type="text"
                value={farmLocation}
                onChange={(e) => setFarmLocation(e.target.value)}
                className="w-full rounded-xl border border-line bg-panel-2 p-2.5 text-ink focus:border-gold focus:outline-none"
              />
            </div>
          </div>

          {/* Organic Claims */}
          <div className="rounded-xl border border-line bg-panel-2 p-3 space-y-3">
            <label htmlFor="orgClaim" className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                id="orgClaim"
                checked={organicClaimed}
                onChange={(e) => setOrganicClaimed(e.target.checked)}
                className="accent-gold rounded h-4 w-4 shrink-0"
              />
              <span className="font-semibold text-ink text-xs">
                Declare as Certified Organic
              </span>
            </label>
            {organicClaimed && (
              <div className="space-y-2.5 pl-6 border-l-2 border-gold/40 ml-1.5">
                <label htmlFor="orgValid" className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    id="orgValid"
                    checked={organicCertValid}
                    onChange={(e) => setOrganicCertValid(e.target.checked)}
                    className="accent-gold rounded h-4 w-4 shrink-0"
                  />
                  <span className="text-muted text-xs">
                    Accredited certification is valid & unexpired
                  </span>
                </label>
                <div className="pt-0.5">
                  <label className="text-muted block mb-1 text-[10px] font-semibold">Accreditation Cert Reference</label>
                  <input
                    type="text"
                    placeholder="e.g. APEDA/ORG/2026/89421"
                    value={certReference}
                    onChange={(e) => setCertReference(e.target.value)}
                    className="w-full rounded-xl border border-line bg-panel p-2.5 text-ink text-xs focus:border-gold focus:outline-none font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 text-[11px] text-muted border-t border-line pt-3 pb-2">
            <ShieldCheck size={14} className="text-emerald-400 shrink-0" />
            <span>Will be digitally signed with Farmer's Ed25519 private key upon submission.</span>
          </div>

          <div className="sticky bottom-0 bg-panel border-t border-line/60 pt-3 flex items-center justify-end gap-3 -mx-6 -mb-6 px-6 pb-6 rounded-b-3xl mt-2">
            <button type="button" onClick={onClose} className="btn-ghost px-4 py-2 text-xs">
              Cancel
            </button>
            <button
              type="submit"
              disabled={harvestMutation.isPending}
              className="btn-gold px-5 py-2.5 text-xs font-bold flex items-center gap-1.5 shadow"
            >
              {harvestMutation.isPending ? "Signing & Registering..." : "Sign & Register Batch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
