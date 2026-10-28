import { GraduationCap, RefreshCw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useFeedback, useModelHistory, useRetrain } from "../api/hooks";
import type { Headline } from "../api/types";
import { cap } from "../lib/format";
import { C, axisProps } from "../lib/tokens";
import { useApp } from "../state/AppState";
import { ChartTooltip, Legend } from "./charts";
import { Card, CardTitle, ErrorBox } from "./ui";

const ROWS: { key: keyof Headline; label: string }[] = [
  { key: "pr_auc", label: "PR-AUC" },
  { key: "f1", label: "F1" },
  { key: "precision", label: "Precision" },
  { key: "recall", label: "Recall" },
  { key: "shifted_f1", label: "F1 (shifted set)" },
];

/** Auditor verdicts → training labels → retrain → hot-swapped model, with before/after metrics. */
export function LearningLoop() {
  const fb = useFeedback();
  const history = useModelHistory();
  const retrain = useRetrain();
  const { pushToast } = useApp();
  const result = retrain.data;

  const run = async () => {
    const r = await retrain.mutateAsync();
    pushToast({
      tone: "ok",
      title: `Model retrained → ${r.model_version}`,
      body: `${r.feedback.rows} auditor labels used · live scoring now uses the new model`,
    });
  };

  const points = (history.data ?? []).map((h, i) => ({
    v: `v${i + 1}`,
    version: h.model_version,
    pr_auc: h.pr_auc,
    f1: h.f1,
    labels: h.feedback_rows,
  }));

  return (
    <Card className="mt-5">
      <CardTitle
        title="Learning loop"
        sub="Every auditor verdict becomes a training label: Approved → legitimate (a false alarm), Rejected → the fraud type the model suspected. Retraining adds them (weight ×5) to the training split only, so test metrics stay comparable."
        right={
          <button
            onClick={run}
            disabled={retrain.isPending || !fb.data?.usable_labels}
            className="btn-gold flex shrink-0 items-center gap-1.5 px-4 py-2 text-sm"
          >
            <RefreshCw size={15} className={retrain.isPending ? "animate-spin" : ""} />
            {retrain.isPending ? "Retraining… (~10 s)" : "Retrain with auditor feedback"}
          </button>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="card-inner space-y-3 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <GraduationCap size={16} className="text-gold" /> Labels available
          </p>
          {fb.data ? (
            <>
              <p className="tnum text-4xl font-light text-ink">{fb.data.usable_labels}</p>
              <p className="text-xs text-muted">
                from {fb.data.reviews} auditor reviews · {fb.data.approved} approved · {fb.data.rejected}{" "}
                rejected
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(fb.data.label_counts).map(([k, v]) => (
                  <span key={k} className="pill border border-line px-2 py-0.5 text-[10px] text-ink-2">
                    {k === "none" ? "Legitimate" : cap(k.replace(/_/g, " "))} · {v}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-muted">
                Review more items in Quarantine to grow this. Forged-signature rejections are not used — that
                fraud is caught by cryptography, not the model.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">Loading…</p>
          )}
        </div>

        <div className="card-inner p-4">
          <p className="mb-3 text-sm font-semibold text-ink">
            {result ? "Before → after (held-out test set)" : "Last retrain"}
          </p>
          {retrain.error && <ErrorBox error={retrain.error} />}
          {result ? (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
                    <th className="pb-1.5 font-medium">Metric</th>
                    <th className="pb-1.5 text-right font-medium">Before</th>
                    <th className="pb-1.5 text-right font-medium">After</th>
                    <th className="pb-1.5 text-right font-medium">Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map(({ key, label }) => {
                    const d = result.after[key] - result.before[key];
                    return (
                      <tr key={key} className="border-t border-line">
                        <td className="py-1.5 text-ink-2">{label}</td>
                        <td className="tnum py-1.5 text-right font-mono text-muted">
                          {result.before[key].toFixed(3)}
                        </td>
                        <td className="tnum py-1.5 text-right font-mono text-ink">
                          {result.after[key].toFixed(3)}
                        </td>
                        <td
                          className={`tnum py-1.5 text-right font-mono ${
                            Math.abs(d) < 0.0005 ? "text-muted" : d > 0 ? "text-clear-ink" : "text-quar-ink"
                          }`}
                        >
                          {d >= 0 ? "+" : ""}
                          {d.toFixed(3)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted">
                {result.previous_version} → <span className="text-gold">{result.model_version}</span>. With a
                few dozen labels next to 15,000 synthetic rows the change is small; it grows as auditors
                review more.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted">
              Press <b className="text-ink-2">Retrain</b> to fold the auditors' verdicts into the model. Takes
              about 10 seconds; new transactions are then scored by the new version.
            </p>
          )}
        </div>

        <div className="card-inner p-4">
          <p className="mb-1 text-sm font-semibold text-ink">Model versions</p>
          <div className="mb-1">
            <Legend
              items={[
                { label: "PR-AUC", color: C.gold },
                { label: "F1", color: "#8a8983" },
              ]}
            />
          </div>
          {points.length < 2 ? (
            <p className="py-6 text-center text-xs text-muted">
              {points.length === 1 ? `1 version so far (${points[0].version}).` : "No history yet."} Retrain
              to start the trend.
            </p>
          ) : (
            <div className="h-36">
              <ResponsiveContainer>
                <LineChart data={points} margin={{ left: -22, right: 6, top: 6 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="v" {...axisProps} />
                  <YAxis {...axisProps} domain={[0.85, 1]} tickFormatter={(v: number) => v.toFixed(2)} />
                  <Tooltip
                    content={
                      <ChartTooltip
                        labelFormatter={(l) => points.find((p) => p.v === l)?.version ?? String(l)}
                        valueFormatter={(v) => Number(v).toFixed(3)}
                      />
                    }
                  />
                  <Line dataKey="pr_auc" name="PR-AUC" stroke={C.gold} strokeWidth={2} dot={{ r: 3 }} />
                  <Line dataKey="f1" name="F1" stroke="#8a8983" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
