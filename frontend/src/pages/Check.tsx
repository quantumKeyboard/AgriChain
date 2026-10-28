import { FlaskConical, Link2, Send, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { useHealth, useMeta, useScore, useSubmit } from "../api/hooks";
import type { Assessment, TxInput } from "../api/types";
import { RuleList, ScoreBreakdown, ShapBars } from "../components/Explain";
import { RiskSun } from "../components/RiskSun";
import { Card, CardTitle, Empty, ErrorBox, Field, Loading, PageTitle, StatusBadge } from "../components/ui";
import { STAGE_LABEL, cap, inr } from "../lib/format";

const BLANK: TxInput = {
  batch_id: "B-MANUAL01",
  crop: "wheat",
  stage: "FARM_TO_COOP",
  seller_id: "F-001",
  buyer_id: "C-001",
  quantity_kg: 5000,
  unit_price: 25,
  ref_price: 25,
  quality_grade: "A",
  moisture_pct: 12,
  organic_claimed: false,
  organic_cert_valid: false,
  transit_km: 120,
  transit_hours: 4,
  temp_avg_c: 24,
  temp_max_c: 28,
  cold_chain_ok_claimed: false,
  payment_mode: "BANK",
  batch: null,
};

export default function Check() {
  const { data: meta, isLoading } = useMeta();
  const { data: health } = useHealth();
  const [tx, setTx] = useState<TxInput>(BLANK);
  const [exampleLabel, setExampleLabel] = useState<string | null>(null);
  const [loadingEx, setLoadingEx] = useState<string | null>(null);
  const [exError, setExError] = useState<unknown>(null);
  const score = useScore();
  const submit = useSubmit();
  const [result, setResult] = useState<Assessment | null>(null);

  const stage = meta?.stages.find((s) => s.name === tx.stage);
  const sellers = useMemo(
    () => meta?.participants.filter((p) => p.role === stage?.seller_role) ?? [],
    [meta, stage],
  );
  const buyers = useMemo(
    () => meta?.participants.filter((p) => p.role === stage?.buyer_role) ?? [],
    [meta, stage],
  );

  const loadExample = async (type: string) => {
    setLoadingEx(type);
    setExError(null);
    try {
      const res = await api.get<{
        transaction: TxInput & { id?: string; timestamp?: string };
        label: string;
      }>(`/sim/example?type=${type}`);
      const { id: _id, timestamp: _ts, ...rest } = res.transaction;
      void _id;
      void _ts;
      setTx(rest);
      setExampleLabel(res.label);
      setResult(null);
      submit.reset();
      const r = await score.mutateAsync(rest);
      setResult(r);
    } catch (e) {
      setExError(e);
    } finally {
      setLoadingEx(null);
    }
  };

  useEffect(() => {
    if (meta && !exampleLabel) loadExample("none");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta]);

  const set = <K extends keyof TxInput>(k: K, v: TxInput[K]) => {
    setTx((t) => ({ ...t, [k]: v }));
    setExampleLabel((l) => (l ? `${l} (edited)`.replace(" (edited) (edited)", " (edited)") : l));
  };

  const onStage = (s: string) => {
    const st = meta?.stages.find((x) => x.name === s);
    const seller = meta?.participants.find((p) => p.role === st?.seller_role);
    const buyer = meta?.participants.find((p) => p.role === st?.buyer_role);
    setTx((t) => ({
      ...t,
      stage: s,
      seller_id: seller?.id ?? t.seller_id,
      buyer_id: buyer?.id ?? t.buyer_id,
    }));
  };

  const analyze = async () => {
    submit.reset();
    setResult(await score.mutateAsync(tx));
  };

  if (isLoading || !meta) return <Loading />;
  const flag = health?.thresholds.flag ?? 0.4;
  const quarantine = health?.thresholds.quarantine ?? 0.7;

  return (
    <>
      <PageTitle
        title="Check a transaction"
        sub="Load a realistic example (or edit any field) and see how the hybrid engine scores it — then commit it to the chain."
      />
      <Card className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-2 flex items-center gap-1.5 text-xs text-muted">
            <Sparkles size={14} className="text-gold" /> Load example:
          </span>
          <button
            className="btn-ghost px-3 py-1.5 text-xs"
            onClick={() => loadExample("none")}
            disabled={!!loadingEx}
          >
            ✓ Legitimate
          </button>
          {meta.fraud_types.map((f) => (
            <button
              key={f.type}
              className="btn-ghost px-3 py-1.5 text-xs"
              onClick={() => loadExample(f.type)}
              disabled={!!loadingEx}
            >
              {loadingEx === f.type ? "…" : f.label}
            </button>
          ))}
        </div>
        {exError !== null && (
          <div className="mt-3">
            <ErrorBox error={exError} />
          </div>
        )}
      </Card>

      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="xl:col-span-7">
          <CardTitle
            title="Transaction"
            sub={exampleLabel ? `Loaded: ${exampleLabel}` : "Manual entry"}
            right={
              <button
                onClick={analyze}
                className="btn-gold flex items-center gap-1.5 px-4 py-2 text-sm"
                disabled={score.isPending}
              >
                <FlaskConical size={15} /> {score.isPending ? "Scoring…" : "Analyze"}
              </button>
            }
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Crop">
              <select value={tx.crop} onChange={(e) => set("crop", e.target.value)}>
                {meta.crops.map((c) => (
                  <option key={c.name} value={c.name}>
                    {cap(c.name)} {c.perishable ? `(perishable ≤${c.temp_limit}°C)` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Stage">
              <select value={tx.stage} onChange={(e) => onStage(e.target.value)}>
                {meta.stages.map((s) => (
                  <option key={s.name} value={s.name}>
                    {STAGE_LABEL[s.name]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Batch ID" hint="Existing batch = history is used">
              <input value={tx.batch_id} onChange={(e) => set("batch_id", e.target.value)} />
            </Field>
            <Field label="Seller">
              <select value={tx.seller_id} onChange={(e) => set("seller_id", e.target.value)}>
                {sellers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Buyer">
              <select value={tx.buyer_id} onChange={(e) => set("buyer_id", e.target.value)}>
                {buyers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.name}
                  </option>
                ))}
                {!buyers.some((b) => b.id === tx.buyer_id) && (
                  <option value={tx.buyer_id}>{tx.buyer_id} (out of role)</option>
                )}
              </select>
            </Field>
            <Field label="Payment">
              <select value={tx.payment_mode} onChange={(e) => set("payment_mode", e.target.value)}>
                {["BANK", "UPI", "CASH"].map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity (kg)">
              <input
                type="number"
                min={1}
                value={tx.quantity_kg}
                onChange={(e) => set("quantity_kg", Number(e.target.value))}
              />
            </Field>
            <Field
              label="Unit price (₹/kg)"
              hint={tx.ref_price ? `Market reference ${inr(tx.ref_price)}` : undefined}
            >
              <input
                type="number"
                step="0.01"
                min={0.01}
                value={tx.unit_price}
                onChange={(e) => set("unit_price", Number(e.target.value))}
              />
            </Field>
            <Field label="Quality grade">
              <select value={tx.quality_grade} onChange={(e) => set("quality_grade", e.target.value)}>
                {["A", "B", "C"].map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Transit distance (km)">
              <input
                type="number"
                min={0}
                value={tx.transit_km}
                onChange={(e) => set("transit_km", Number(e.target.value))}
              />
            </Field>
            <Field label="Transit time (h)">
              <input
                type="number"
                step="0.1"
                min={0.1}
                value={tx.transit_hours}
                onChange={(e) => set("transit_hours", Number(e.target.value))}
              />
            </Field>
            <Field label="Moisture %">
              <input
                type="number"
                step="0.1"
                value={tx.moisture_pct}
                onChange={(e) => set("moisture_pct", Number(e.target.value))}
              />
            </Field>
            <Field label="Avg temp (°C)">
              <input
                type="number"
                step="0.1"
                value={tx.temp_avg_c}
                onChange={(e) => set("temp_avg_c", Number(e.target.value))}
              />
            </Field>
            <Field label="Max temp (°C)">
              <input
                type="number"
                step="0.1"
                value={tx.temp_max_c}
                onChange={(e) => set("temp_max_c", Number(e.target.value))}
              />
            </Field>
            <div className="flex flex-col justify-end gap-2 text-sm text-ink-2">
              <CheckBox
                label="Declared 'cold chain OK'"
                on={tx.cold_chain_ok_claimed}
                set={(v) => set("cold_chain_ok_claimed", v)}
              />
              <CheckBox
                label="Sold as organic"
                on={tx.organic_claimed}
                set={(v) => set("organic_claimed", v)}
              />
              <CheckBox
                label="Valid organic certificate"
                on={tx.organic_cert_valid}
                set={(v) => set("organic_cert_valid", v)}
              />
              <CheckBox
                label="Forge signature (signed by someone else)"
                on={!!tx.forge_signature}
                set={(v) => set("forge_signature", v)}
              />
            </div>
          </div>
          {score.error && (
            <div className="mt-4">
              <ErrorBox error={score.error} />
            </div>
          )}
        </Card>

        <Card className="xl:col-span-5">
          <CardTitle title="Assessment" sub="Random Forest + Isolation Forest + rule engine" />
          {score.isPending && !result ? (
            <Loading label="Scoring…" />
          ) : !result ? (
            <Empty
              title="No assessment yet"
              body="Load an example or press Analyze."
              icon={<FlaskConical />}
            />
          ) : (
            <div className="space-y-5">
              <div className="flex items-center gap-5">
                <RiskSun risk={result.risk} size={150} flag={flag} quarantine={quarantine} />
                <div className="space-y-2">
                  <StatusBadge status={result.decision} />
                  <p className="text-sm text-ink-2">
                    {result.decision === "QUARANTINED"
                      ? "Would be held out of the ledger for auditor review."
                      : result.decision === "FLAGGED"
                        ? "Would be committed with a fraud flag."
                        : "Would be committed to the next block."}
                  </p>
                  {result.pred_type !== "none" && (
                    <p className="text-xs text-muted">
                      Suspected type: <span className="font-semibold text-gold">{result.pred_label}</span>
                    </p>
                  )}
                </div>
              </div>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Rule engine
                </h4>
                <RuleList hits={result.rule_hits} />
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Model explanation (SHAP)
                </h4>
                <ShapBars items={result.shap_top ?? []} />
              </section>
              <section>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  Hybrid score
                </h4>
                <ScoreBreakdown p={result.p_fraud} rules={result.rule_score} anomaly={result.anomaly_score} />
              </section>
              <div className="border-t border-line pt-4">
                {submit.data ? (
                  <div className="rounded-2xl bg-panel-2 p-3 text-sm" role="status">
                    <p className="flex items-center gap-2 text-ink">
                      <Link2 size={15} className="text-gold" /> Recorded as {submit.data.tx_id}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {submit.data.decision === "QUARANTINED" ? (
                        <>
                          Held in quarantine —{" "}
                          <Link to="/quarantine" className="text-gold hover:underline">
                            review it now
                          </Link>
                          .
                        </>
                      ) : submit.data.sealed_blocks?.length ? (
                        <>
                          Sealed into{" "}
                          <Link
                            to={`/ledger?block=${submit.data.sealed_blocks.at(-1)}`}
                            className="text-gold hover:underline"
                          >
                            block #{submit.data.sealed_blocks.at(-1)}
                          </Link>
                          .
                        </>
                      ) : (
                        "Added to the mempool — sealed when the next block fills."
                      )}
                    </p>
                  </div>
                ) : (
                  <button
                    onClick={() => submit.mutate(tx)}
                    disabled={submit.isPending}
                    className="btn-gold flex w-full items-center justify-center gap-2 py-3 text-sm"
                  >
                    <Send size={15} />{" "}
                    {submit.isPending ? "Submitting…" : "Submit to the blockchain pipeline"}
                  </button>
                )}
                {submit.error && (
                  <div className="mt-3">
                    <ErrorBox error={submit.error} />
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function CheckBox({ label, on, set }: { label: string; on: boolean; set: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => set(e.target.checked)}
        className="!h-4 !w-4 accent-[#e8c15a]"
      />
      {label}
    </label>
  );
}
