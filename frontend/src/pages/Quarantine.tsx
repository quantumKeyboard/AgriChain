import { CheckCircle2, ShieldCheck, ShieldX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useDecision, useQuarantine } from "../api/hooks";
import { TxDetail } from "../components/TxDrawer";
import {
  Card,
  CardTitle,
  Empty,
  ErrorBox,
  Loading,
  PageTitle,
  RiskPill,
  StatusBadge,
} from "../components/ui";
import { CROP_EMOJI, cap, clock, inrCompact, kg, timeAgo } from "../lib/format";
import { useApp } from "../state/AppState";

export default function Quarantine() {
  const { data, isLoading, error, refetch } = useQuarantine();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const decision = useDecision();
  const { pushToast } = useApp();

  const open = (data?.open ?? []).slice().sort((a, b) => b.risk - a.risk);
  const current = open.find((t) => t.id === selected) ?? open[0];

  useEffect(() => {
    setNote("");
  }, [current?.id]);

  const act = async (action: "approve" | "reject") => {
    if (!current) return;
    const res = await decision.mutateAsync({
      id: current.id,
      action,
      note: note || (action === "reject" ? "Rejected after review." : "Approved after review."),
    });
    pushToast({
      tone: action === "reject" ? "danger" : "ok",
      title: `${current.id} ${res.status.toLowerCase()}`,
      body: res.sealed_blocks.length
        ? `Verdict sealed into block #${res.sealed_blocks.at(-1)}`
        : "Verdict queued",
      href: res.sealed_blocks.length ? `/ledger?block=${res.sealed_blocks.at(-1)}` : undefined,
    });
    setSelected(null);
  };

  return (
    <>
      <PageTitle
        title="Quarantine"
        sup={open.length}
        sub="High-risk transactions are held off-chain until an auditor decides. Either verdict is then written permanently to the ledger."
      />
      {isLoading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : (
        <div className="grid gap-5 xl:grid-cols-12">
          <Card className="xl:col-span-4">
            <CardTitle title="Awaiting review" sub="Highest risk first" />
            {!open.length ? (
              <Empty
                icon={<CheckCircle2 />}
                title="Queue is clear"
                body="Use “Inject fraud” in the top bar to send a suspicious transaction."
              />
            ) : (
              <ul className="space-y-2">
                {open.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => setSelected(t.id)}
                      className={`card-inner flex w-full items-center gap-3 p-3 text-left transition ${
                        current?.id === t.id ? "!border-gold" : "hover:border-[#4a4a46]"
                      }`}
                    >
                      <span className="text-2xl" aria-hidden>
                        {CROP_EMOJI[t.crop]}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">{t.pred_label}</span>
                        <span className="block truncate text-[11px] text-muted">
                          {t.id} · {cap(t.crop)} {kg(t.quantity_kg)} · {timeAgo(t.timestamp)}
                        </span>
                      </span>
                      <span className="flex flex-col items-end gap-1">
                        <RiskPill risk={t.risk} />
                        <span className="tnum text-[11px] text-muted">{inrCompact(t.total_value)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="xl:col-span-8">
            {!current ? (
              <Empty title="Nothing selected" />
            ) : (
              <div className="grid gap-6 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  <TxDetail tx={current} compact />
                </div>
                <div className="space-y-4 lg:col-span-2">
                  <div className="card-inner space-y-3 p-4">
                    <p className="text-sm font-semibold text-ink">Auditor decision</p>
                    <p className="text-xs text-muted">
                      Rejecting writes a permanent <b className="text-quar-ink">REJECTED</b> record to the
                      chain; approving releases the transaction as <b className="text-clear-ink">APPROVED</b>.
                    </p>
                    <textarea
                      rows={3}
                      placeholder="Note for the audit trail (optional)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => act("approve")}
                        disabled={decision.isPending}
                        className="btn-ghost flex items-center justify-center gap-1.5 py-2.5 text-sm"
                      >
                        <ShieldCheck size={15} className="text-clear-ink" /> Approve
                      </button>
                      <button
                        onClick={() => act("reject")}
                        disabled={decision.isPending}
                        className="flex items-center justify-center gap-1.5 rounded-full bg-quar py-2.5 text-sm font-semibold text-white hover:brightness-110"
                      >
                        <ShieldX size={15} /> Reject
                      </button>
                    </div>
                    {decision.error && <ErrorBox error={decision.error} />}
                  </div>
                  {current.type_probs && (
                    <div className="card-inner p-4">
                      <p className="mb-3 text-sm font-semibold text-ink">Fraud-type probabilities</p>
                      <div className="space-y-2">
                        {Object.entries(current.type_probs)
                          .sort((a, b) => b[1] - a[1])
                          .map(([k, v]) => (
                            <div key={k}>
                              <div className="mb-0.5 flex justify-between text-[11px]">
                                <span className="text-ink-2">{cap(k.replace(/_/g, " "))}</span>
                                <span className="tnum font-mono text-muted">{(v * 100).toFixed(0)}%</span>
                              </div>
                              <div className="h-1.5 rounded-full bg-panel-3">
                                <div
                                  className="h-1.5 rounded-full bg-gold"
                                  style={{ width: `${v * 100}%` }}
                                />
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>

          <Card className="xl:col-span-12">
            <CardTitle title="Recently reviewed" sub="Verdicts already sealed on-chain" />
            {!data?.reviewed.length ? (
              <Empty title="No reviews yet" />
            ) : (
              <div className="overflow-x-auto scroll-thin">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
                      <th className="pb-2 font-medium">Transaction</th>
                      <th className="pb-2 font-medium">Suspected</th>
                      <th className="pb-2 font-medium">Risk</th>
                      <th className="pb-2 font-medium">Verdict</th>
                      <th className="pb-2 font-medium">Note</th>
                      <th className="pb-2 font-medium">Block</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviewed.map((t) => (
                      <tr key={t.id} className="border-t border-line">
                        <td className="py-2.5 font-mono text-xs text-ink-2">
                          {t.id}
                          <span className="block font-sans text-[11px] text-muted">{clock(t.timestamp)}</span>
                        </td>
                        <td className="text-ink-2">{t.pred_label}</td>
                        <td>
                          <RiskPill risk={t.risk} />
                        </td>
                        <td>
                          <StatusBadge status={t.review?.action ?? t.ledger_status} small />
                        </td>
                        <td className="max-w-xs truncate text-xs text-muted">{t.review?.note}</td>
                        <td>
                          {t.block_index !== null ? (
                            <Link to={`/ledger?block=${t.block_index}`} className="text-gold hover:underline">
                              #{t.block_index}
                            </Link>
                          ) : (
                            <span className="text-muted">mempool</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
