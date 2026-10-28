import {
  AlertOctagon,
  Ban,
  Boxes,
  Database,
  Download,
  FileSignature,
  FileCode2,
  Hammer,
  KeyRound,
  Link2,
  RotateCcw,
  ShieldCheck,
  Skull,
  UserX,
  XCircle,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, exportUrl } from "../api/client";
import { useBlock, useBlocks, useChainInfo, useHealth, useRefreshAll, useVerify } from "../api/hooks";
import type { AttackKind, AttackResult, EthTx, VerifyResult } from "../api/types";
import { TxDrawer } from "../components/TxDrawer";
import { Card, CardTitle, ErrorBox, Loading, PageTitle, StatusBadge } from "../components/ui";
import { CROP_EMOJI, ethShort, inrCompact, num, unixClock } from "../lib/format";
import { C } from "../lib/tokens";
import { useApp } from "../state/AppState";

const PROBLEM_LABEL: Record<string, string> = {
  DATA_MISMATCH: "Invoice data edited",
  BAD_SIGNATURE: "Seller signature broken",
  STATUS_MISMATCH: "Verdict / status edited",
  MISSING_OFF_CHAIN: "Row deleted from database",
  NOT_ON_CHAIN: "Fake on-chain claim",
};

export default function Ledger() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useBlocks(40);
  const verify = useVerify();
  const [vr, setVr] = useState<VerifyResult | null>(null);
  const selected = params.get("block") !== null ? Number(params.get("block")) : (data?.head ?? null);
  const [openTx, setOpenTx] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  // Keep the selected block (default: newest) centred in the strip; the chain reads left → right.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      const child = el.querySelector<HTMLElement>(`[data-block="${selected}"]`);
      el.scrollLeft = child
        ? child.offsetLeft - el.offsetLeft - el.clientWidth / 2 + child.clientWidth / 2
        : el.scrollWidth;
    });
    return () => cancelAnimationFrame(id);
  }, [data, selected]);

  const runVerify = async () => setVr(await verify.mutateAsync());

  // Re-verify automatically when new blocks arrive and a result is showing.
  useEffect(() => {
    if (vr) runVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.head]);

  return (
    <>
      <PageTitle
        title="Ledger"
        sup={data ? `#${data.head}` : undefined}
        sub="A Solidity smart contract on a real Ethereum node. The ML oracle records every screened transaction on-chain; auditors' verdicts are on-chain transactions too. Records are write-once."
      />
      <div className="grid gap-5 xl:grid-cols-12">
        <div className="space-y-5 xl:col-span-8">
          <ContractCard vr={vr} verifying={verify.isPending} onVerify={runVerify} onOpenTx={setOpenTx} />
          <Card>
            <CardTitle
              title="Ethereum blocks"
              sub="Newest on the right · each block links to its parent hash · dot = transaction (green success, red reverted)"
            />
            {isLoading ? (
              <Loading />
            ) : error ? (
              <ErrorBox error={error} onRetry={refetch} />
            ) : (
              <div ref={stripRef} className="scroll-thin flex items-center gap-1 overflow-x-auto pb-3">
                {data!.blocks
                  .slice()
                  .reverse()
                  .map((b, i, arr) => {
                    const sel = b.number === selected;
                    const reverted = b.transactions.some((t) => t.status === "reverted");
                    const border = sel ? C.gold : reverted ? C.quar : C.line;
                    const fn = b.transactions[0]?.function ?? "genesis";
                    return (
                      <div key={b.number} className="flex shrink-0 items-center gap-1">
                        <button
                          data-block={b.number}
                          onClick={() => setParams({ block: String(b.number) })}
                          className="flex w-[104px] flex-col gap-1.5 rounded-2xl border bg-panel-2 p-2.5 text-left transition hover:brightness-125"
                          style={{ borderColor: border, boxShadow: sel ? `0 0 0 1px ${border}` : undefined }}
                          title={`Block #${b.number}\n${b.hash}`}
                        >
                          <span className="flex items-center justify-between">
                            <span className="tnum text-xs font-semibold text-ink">#{b.number}</span>
                            <Boxes size={12} className="text-muted" />
                          </span>
                          <span className="font-mono text-[9px] text-muted">{b.hash.slice(0, 10)}</span>
                          <span className="truncate text-[9px] text-ink-2">{fn}</span>
                          <span className="flex gap-[3px]" aria-label={`${b.tx_count} transactions`}>
                            {b.transactions.map((t) => (
                              <span
                                key={t.hash}
                                className="h-1.5 flex-1 rounded-full"
                                style={{ background: t.status === "success" ? C.clear : C.quar }}
                              />
                            ))}
                            {b.tx_count === 0 && <span className="text-[9px] text-muted">empty</span>}
                          </span>
                        </button>
                        {i < arr.length - 1 && <Link2 size={12} className="text-muted" aria-hidden />}
                      </div>
                    );
                  })}
              </div>
            )}
            <p className="text-[11px] text-muted">
              Hardhat mines one block per transaction (automine). Bulk history was recorded with{" "}
              <span className="font-mono">recordTransactions</span> (25 invoices per Ethereum transaction).
            </p>
          </Card>
        </div>

        <DemoPanel onDone={() => setVr(null)} onVerify={runVerify} />

        <div className="xl:col-span-12">
          {selected !== null && <BlockPanel number={selected} onOpenTx={setOpenTx} />}
        </div>
      </div>
      <TxDrawer id={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}

function ContractCard({
  vr,
  verifying,
  onVerify,
  onOpenTx,
}: {
  vr: VerifyResult | null;
  verifying: boolean;
  onVerify: () => void;
  onOpenTx: (id: string) => void;
}) {
  const { data: info, isLoading, error, refetch } = useChainInfo();
  return (
    <Card>
      <CardTitle
        title="AgriChainLedger contract"
        sub={info ? `${info.network} · chain id ${info.chain_id} · ${info.client}` : undefined}
        right={
          <div className="flex items-center gap-2">
            <a
              href={exportUrl("chain.csv")}
              className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
              title="Download every on-chain record (read live from the contract) as CSV"
            >
              <Download size={14} /> CSV
            </a>
            <button
              onClick={onVerify}
              disabled={verifying}
              className="btn-gold flex items-center gap-1.5 px-4 py-2 text-sm"
            >
              <ShieldCheck size={15} /> {verifying ? "Verifying…" : "Verify against chain"}
            </button>
          </div>
        }
      />
      {vr && <VerifyBanner vr={vr} onOpenTx={onOpenTx} />}
      {isLoading ? (
        <Loading />
      ) : error || !info ? (
        <ErrorBox error={error} onRetry={refetch} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <dl className="space-y-2.5 text-xs">
            <HashRow k="Contract address" v={info.contract_address ?? "—"} gold />
            <HashRow k="Deployed in transaction" v={info.deploy_tx ?? "—"} />
            <div className="grid grid-cols-3 gap-2">
              <Mini k="Block height" v={num(info.block_number)} />
              <Mini k="Records" v={num(info.record_count)} />
              <Mini k="Deploy block" v={`#${info.deploy_block}`} />
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              <FileCode2 size={13} className="text-gold" /> {info.solidity}
            </p>
          </dl>
          <div>
            <p className="mb-2 text-[10px] uppercase tracking-wider text-muted">
              Accounts acting on the contract
            </p>
            <ul className="space-y-1.5">
              {info.accounts.map((a) => (
                <li key={a.address} className="card-inner flex items-center justify-between gap-2 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-xs text-ink">{a.role}</span>
                    <span className="block truncate font-mono text-[10px] text-muted" title={a.address}>
                      {a.address}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[11px] text-ink-2">{a.balance_eth.toFixed(3)} ETH</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-muted">
              Every participant also has its own Ethereum address and signs its invoices (EIP-712); the
              contract checks that signature before recording anything.
            </p>
          </div>
        </div>
      )}
    </Card>
  );
}

function VerifyBanner({ vr, onOpenTx }: { vr: VerifyResult; onOpenTx: (id: string) => void }) {
  return (
    <div
      role="status"
      className={`mb-4 rounded-2xl border px-4 py-3 text-sm ${
        vr.valid ? "border-clear/50 bg-clear/10 text-clear-ink" : "border-quar/60 bg-quar/10 text-quar-ink"
      }`}
    >
      <div className="flex items-start gap-3">
        {vr.valid ? (
          <ShieldCheck size={18} className="shrink-0" />
        ) : (
          <AlertOctagon size={18} className="shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {vr.valid
              ? `Database matches the blockchain — all ${vr.checked} on-chain records verified`
              : `Tampering detected — ${vr.issues.length} mismatch${vr.issues.length === 1 ? "" : "es"} with the blockchain`}
          </p>
          <p className="mt-0.5 text-xs opacity-90">
            {vr.valid
              ? `Each record was read back from the contract at block #${vr.block_number}: data hash, status and the seller's signature all match the off-chain copy. ${vr.off_chain_only} forged invoice(s) were never allowed on-chain.`
              : "The smart contract still holds the original data hash and status, so any edit to the off-chain database shows up here."}
          </p>
        </div>
      </div>
      {!vr.valid && (
        <ul className="mt-3 space-y-1.5">
          {vr.issues.slice(0, 8).map((i) => (
            <li key={i.tx_id + i.problem}>
              <button
                onClick={() => onOpenTx(i.tx_id)}
                className="flex w-full flex-wrap items-baseline gap-x-2 rounded-xl bg-quar/10 px-3 py-1.5 text-left text-xs hover:bg-quar/20"
              >
                <span className="font-mono text-ink">{i.tx_id}</span>
                <span className="font-semibold">{PROBLEM_LABEL[i.problem] ?? i.problem}</span>
                {i.block !== null && <span className="text-muted">block #{i.block}</span>}
                <span className="w-full text-[11px] opacity-90">{i.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const DB_ATTACKS: { kind: AttackKind; icon: React.ReactNode; title: string; body: string }[] = [
  {
    kind: "db_quantity",
    icon: <Hammer size={15} />,
    title: "Inflate a recorded quantity ×10",
    body: "A trader edits a past invoice in SQLite to claim more goods.",
  },
  {
    kind: "db_verdict",
    icon: <Skull size={15} />,
    title: "Flip a REJECTED verdict to APPROVED",
    body: "A corrupt insider erases an auditor's rejection in the database.",
  },
];

const CHAIN_ATTACKS: { kind: AttackKind; icon: React.ReactNode; title: string; body: string }[] = [
  {
    kind: "chain_overwrite",
    icon: <Database size={15} />,
    title: "Overwrite an on-chain record",
    body: "The oracle re-records an existing transaction with a ×10 quantity.",
  },
  {
    kind: "chain_unauthorized",
    icon: <UserX size={15} />,
    title: "Seller approves their own fraud",
    body: "A seller calls resolve() on their rejected invoice from their own wallet.",
  },
  {
    kind: "chain_reverdict",
    icon: <Ban size={15} />,
    title: "Change a final verdict",
    body: "Even the auditor tries to turn REJECTED into APPROVED.",
  },
  {
    kind: "chain_forged",
    icon: <FileSignature size={15} />,
    title: "Record a forged invoice",
    body: "An invoice in a farmer's name, signed with another participant's key.",
  },
];

function DemoPanel({ onDone, onVerify }: { onDone: () => void; onVerify: () => Promise<void> }) {
  const { data: health } = useHealth();
  const refresh = useRefreshAll();
  const { pushToast, setRunning } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
  const [last, setLast] = useState<AttackResult | null>(null);
  const [, setParams] = useSearchParams();
  if (!health?.demo_mode) return null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e);
    } finally {
      setBusy(null);
    }
  };

  const attack = (kind: AttackKind) =>
    run(kind, async () => {
      const r = await api.post<AttackResult>("/dev/attack", { kind });
      setLast(r);
      refresh();
      if (r.revert) {
        pushToast({ tone: "ok", title: `Reverted by the EVM: ${r.revert.error}`, body: r.change });
        setParams({ block: String(r.revert.block) });
      } else {
        pushToast({ tone: "danger", title: "Database edited behind the chain's back", body: r.change });
        await onVerify();
      }
    });

  const btn = (a: (typeof DB_ATTACKS)[number]) => (
    <DemoButton key={a.kind} {...a} onClick={() => attack(a.kind)} busy={busy === a.kind} disabled={!!busy} />
  );

  return (
    <Card className="self-start xl:col-span-4">
      <CardTitle title="Attack simulation" sub="Demo mode: every attack really runs" />
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
        Off-chain — edit the database
      </p>
      <div className="space-y-2">{DB_ATTACKS.map(btn)}</div>
      <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wider text-muted">
        On-chain — send a real Ethereum transaction
      </p>
      <div className="space-y-2">{CHAIN_ATTACKS.map(btn)}</div>
      {last && <AttackOutcome r={last} />}
      <button
        onClick={() =>
          run("reset", async () => {
            setRunning(false);
            await api.post("/dev/reset");
            setLast(null);
            onDone();
            setParams({});
            refresh();
            pushToast({
              tone: "ok",
              title: "Demo reset",
              body: "Fresh contract deployed and history re-recorded on-chain.",
            });
          })
        }
        disabled={!!busy}
        className="btn-ghost mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-sm"
      >
        <RotateCcw size={14} />{" "}
        {busy === "reset" ? "Deploying & re-seeding…" : "Reset demo (redeploy contract)"}
      </button>
      {err !== null && (
        <div className="mt-2">
          <ErrorBox error={err} />
        </div>
      )}
    </Card>
  );
}

function AttackOutcome({ r }: { r: AttackResult }) {
  const reverted = r.result === "reverted";
  return (
    <div
      className={`mt-4 rounded-2xl border px-3 py-2.5 text-xs ${
        reverted ? "border-clear/50 bg-clear/10 text-clear-ink" : "border-quar/60 bg-quar/10 text-quar-ink"
      }`}
    >
      <p className="flex items-center gap-1.5 font-semibold">
        {reverted ? <XCircle size={14} /> : <AlertOctagon size={14} />}
        {reverted ? `Transaction reverted: ${r.revert!.error}` : "Edit accepted by the database"}
      </p>
      <p className="mt-1 text-ink-2">{r.change}</p>
      {reverted && (
        <dl className="mt-1.5 space-y-0.5 font-mono text-[10px] text-muted">
          {Object.entries(r.revert!.args).map(([k, v]) => (
            <div key={k} className="truncate" title={String(v)}>
              {k}: <span className="text-ink-2">{String(v)}</span>
            </div>
          ))}
          <div className="truncate" title={r.revert!.tx_hash}>
            tx: {ethShort(r.revert!.tx_hash, 10)} · block #{r.revert!.block} · status 0
          </div>
        </dl>
      )}
      <p className="mt-1.5 opacity-90">{r.explain}</p>
    </div>
  );
}

function DemoButton({
  icon,
  title,
  body,
  onClick,
  busy,
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="card-inner flex w-full items-start gap-3 p-3 text-left transition hover:border-quar/60 disabled:opacity-60"
    >
      <span className="mt-0.5 text-quar-ink">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-ink">{busy ? "Working…" : title}</span>
        <span className="block text-[11px] text-muted">{body}</span>
      </span>
    </button>
  );
}

function BlockPanel({ number, onOpenTx }: { number: number; onOpenTx: (id: string) => void }) {
  const { data: b, isLoading, error, refetch } = useBlock(number);
  if (isLoading)
    return (
      <Card>
        <Loading />
      </Card>
    );
  if (error || !b) return <ErrorBox error={error} onRetry={refetch} />;
  return (
    <div className="grid gap-5 lg:grid-cols-12">
      <Card className="lg:col-span-5">
        <CardTitle title={`Block #${b.number}`} sub={unixClock(b.timestamp)} />
        <dl className="space-y-2.5 text-xs">
          <HashRow k="Block hash" v={b.hash} gold />
          <HashRow k="Parent hash" v={b.parent_hash} />
          <HashRow k="State root" v={b.state_root} />
          <HashRow k="Transactions root" v={b.transactions_root} />
          <HashRow k="Receipts root" v={b.receipts_root} />
          <div className="grid grid-cols-3 gap-2">
            <Mini k="Transactions" v={String(b.transactions.length)} />
            <Mini k="Gas used" v={num(b.gas_used)} />
            <Mini k="Gas limit" v={`${(b.gas_limit / 1e6).toFixed(0)} M`} />
          </div>
        </dl>
      </Card>
      <Card className="lg:col-span-7">
        <CardTitle
          title="Transactions in this block"
          sub="Decoded with the contract ABI: function called, who signed it, emitted events"
        />
        {b.transactions.length === 0 ? (
          <p className="text-sm text-muted">No transactions in this block.</p>
        ) : (
          <ul className="space-y-2">
            {b.transactions.map((t) => (
              <EthTxRow key={t.hash} t={t} />
            ))}
          </ul>
        )}
        {b.records.length > 0 && (
          <>
            <p className="mb-2 mt-5 text-[11px] uppercase tracking-wider text-muted">
              Supply-chain records touched ({b.records.length})
            </p>
            <ul className="scroll-thin max-h-[360px] space-y-1.5 overflow-y-auto pr-1">
              {b.records.map((tx) => (
                <li key={tx.id}>
                  <button
                    onClick={() => onOpenTx(tx.id)}
                    className="card-inner flex w-full items-center gap-3 p-2.5 text-left transition hover:border-gold/50"
                    title="Open transaction details"
                  >
                    <span className="text-lg" aria-hidden>
                      {CROP_EMOJI[tx.crop]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-ink">{tx.id}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {tx.seller_name} → {tx.buyer_name} · {inrCompact(tx.total_value)}
                      </span>
                    </span>
                    <StatusBadge status={tx.ledger_status} small />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}

function EthTxRow({ t }: { t: EthTx }) {
  const ok = t.status === "success";
  return (
    <li className={`card-inner p-3 ${ok ? "" : "!border-quar"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-gold">{t.function}()</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
            ok ? "border-clear/50 bg-clear/15 text-clear-ink" : "border-quar/50 bg-quar/15 text-quar-ink"
          }`}
        >
          {ok ? <ShieldCheck size={11} aria-hidden /> : <XCircle size={11} aria-hidden />}
          {ok ? "Success" : "Reverted"}
        </span>
        <span className="tnum ml-auto text-[10px] text-muted">gas {num(t.gas_used)}</span>
      </div>
      <div className="mt-1.5 grid gap-0.5 font-mono text-[10px] text-muted">
        <span className="truncate" title={t.hash}>
          tx&nbsp;&nbsp;&nbsp;{t.hash}
        </span>
        <span className="truncate" title={t.from}>
          from {t.from_label} · {ethShort(t.from, 8)} · nonce {t.nonce}
        </span>
      </div>
      {t.events && t.events.length > 0 && (
        <ul className="mt-2 space-y-1">
          {t.events.slice(0, 6).map((e, i) => (
            <li key={i} className="rounded-lg bg-panel-3 px-2 py-1 font-mono text-[10px] text-ink-2">
              <KeyRound size={10} className="mr-1 inline text-gold" aria-hidden />
              {e.event}(
              {Object.entries(e.args)
                .filter(([k]) => ["txId", "status", "riskBps", "id", "role"].includes(k))
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(", ")}
              )
            </li>
          ))}
          {t.events.length > 6 && (
            <li className="text-[10px] text-muted">+ {t.events.length - 6} more events</li>
          )}
        </ul>
      )}
      {!ok && (
        <p className="mt-2 text-[11px] text-quar-ink">
          The contract rejected this call — the attempt is permanently recorded, but no state changed.
        </p>
      )}
    </li>
  );
}

function HashRow({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-muted">{k}</dt>
      <dd className={`mt-0.5 break-all font-mono text-[11px] ${gold ? "text-gold" : "text-ink-2"}`}>{v}</dd>
    </div>
  );
}

function Mini({ k, v }: { k: string; v: string }) {
  return (
    <div className="card-inner px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-muted">{k}</p>
      <p className="tnum mt-0.5 text-sm text-ink">{v}</p>
    </div>
  );
}
