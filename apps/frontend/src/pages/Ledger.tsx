import {
  AlertOctagon,
  Boxes,
  Download,
  Hammer,
  KeyRound,
  Link2,
  RotateCcw,
  ShieldCheck,
  Skull,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, exportUrl } from "../api/client";
import { useBlock, useBlocks, useHealth, useRefreshAll, useVerify } from "../api/hooks";
import type { VerifyResult } from "../api/types";
import { TxDrawer } from "../components/TxDrawer";
import { Card, CardTitle, ErrorBox, Loading, PageTitle, StatusBadge } from "../components/ui";
import { CROP_EMOJI, clock, inrCompact, shortHash } from "../lib/format";
import { C, STATUS_COLOR } from "../lib/tokens";
import { useApp } from "../state/AppState";

export default function Ledger() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, error, refetch } = useBlocks(60);
  const verify = useVerify();
  const [vr, setVr] = useState<VerifyResult | null>(null);
  const selected = params.get("block") !== null ? Number(params.get("block")) : (data?.height ?? null);
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

  // Re-verify automatically when the chain changes and a result is showing.
  useEffect(() => {
    if (vr) runVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.height]);

  const brokenFrom = vr && !vr.valid ? vr.first_broken_index : null;
  const blockState = (i: number) => {
    if (!vr) return "unknown";
    const r = vr.blocks.find((b) => b.index === i);
    if (r && !r.ok) return "broken";
    if (brokenFrom !== null && i > brokenFrom) return "unverified";
    return "ok";
  };

  return (
    <>
      <PageTitle
        title="Ledger"
        sup={data ? `#${data.height}` : undefined}
        sub="A SHA-256 hash chain: each block stores the Merkle root of its transaction records and the previous block's hash, sealed by proof-of-work."
      />
      <div className="grid gap-5 xl:grid-cols-12">
        <Card className="self-start xl:col-span-8">
          <CardTitle
            title="Chain"
            sub={
              data
                ? `${data.height + 1} blocks · ${data.pending} tx waiting in mempool · difficulty ${data.difficulty} (hash starts with ${"0".repeat(data.difficulty ?? 0)})`
                : undefined
            }
            right={
              <div className="flex items-center gap-2">
                <a
                  href={exportUrl("chain.csv")}
                  className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs"
                  title="Download all block headers as CSV"
                >
                  <Download size={14} /> CSV
                </a>
                <button
                  onClick={runVerify}
                  disabled={verify.isPending}
                  className="btn-gold flex items-center gap-1.5 px-4 py-2 text-sm"
                >
                  <ShieldCheck size={15} /> {verify.isPending ? "Verifying…" : "Verify chain"}
                </button>
              </div>
            }
          />
          {vr && (
            <div
              role="status"
              className={`mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                vr.valid
                  ? "border-clear/50 bg-clear/10 text-clear-ink"
                  : "border-quar/60 bg-quar/10 text-quar-ink"
              }`}
            >
              {vr.valid ? (
                <ShieldCheck size={18} className="shrink-0" />
              ) : (
                <AlertOctagon size={18} className="shrink-0" />
              )}
              <div>
                <p className="font-semibold">
                  {vr.valid
                    ? `Chain intact — all ${vr.blocks_checked} blocks verified`
                    : `Tampering detected in block #${vr.first_broken_index}`}
                </p>
                <p className="mt-0.5 text-xs opacity-90">
                  {vr.valid
                    ? "Every transaction hash, Merkle root, proof-of-work and previous-hash link was recomputed from the database and matches."
                    : `${vr.reason} Every block after it builds on altered history, so it can't be trusted either.`}
                </p>
              </div>
            </div>
          )}
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
                  const st = blockState(b.index);
                  const sel = b.index === selected;
                  const border =
                    st === "broken" ? C.quar : st === "unverified" ? "#6b2a2e" : sel ? C.gold : C.line;
                  return (
                    <div key={b.index} className="flex shrink-0 items-center gap-1">
                      <button
                        data-block={b.index}
                        onClick={() => setParams({ block: String(b.index) })}
                        className="flex w-[92px] flex-col gap-1.5 rounded-2xl border bg-panel-2 p-2.5 text-left transition hover:brightness-125"
                        style={{ borderColor: border, boxShadow: sel ? `0 0 0 1px ${border}` : undefined }}
                        title={`Block #${b.index}\n${b.hash}`}
                      >
                        <span className="flex items-center justify-between">
                          <span className="tnum text-xs font-semibold text-ink">#{b.index}</span>
                          {st === "broken" ? (
                            <Skull size={12} className="text-quar-ink" />
                          ) : st === "ok" ? (
                            <ShieldCheck size={12} className="text-clear-ink" />
                          ) : (
                            <Boxes size={12} className="text-muted" />
                          )}
                        </span>
                        <span className="font-mono text-[9px] text-muted">{b.hash.slice(0, 8)}</span>
                        <span className="flex gap-[2px]" aria-label={`${b.tx_count} transactions`}>
                          {Object.entries(b.status_counts).flatMap(([s, n]) =>
                            Array.from({ length: n }).map((_, k) => (
                              <span
                                key={s + k}
                                className="h-1.5 flex-1 rounded-full"
                                style={{ background: STATUS_COLOR[s] }}
                              />
                            )),
                          )}
                          {b.tx_count === 0 && <span className="text-[9px] text-muted">genesis</span>}
                        </span>
                      </button>
                      {i < arr.length - 1 && (
                        <Link2
                          size={12}
                          className={
                            brokenFrom !== null && b.index >= brokenFrom ? "text-quar" : "text-muted"
                          }
                          aria-hidden
                        />
                      )}
                    </div>
                  );
                })}
            </div>
          )}
          <p className="text-[11px] text-muted">
            Bars inside each block: one per transaction record ·{" "}
            <span className="text-clear-ink">committed/approved</span> ·{" "}
            <span className="text-flag-ink">flagged</span> · <span className="text-quar-ink">rejected</span>.
            Showing the latest 60 blocks.
          </p>
        </Card>

        <DemoPanel onDone={() => setVr(null)} onVerify={runVerify} />

        <div className="xl:col-span-12">
          {selected !== null && <BlockPanel index={selected} onOpenTx={setOpenTx} />}
        </div>
      </div>
      <TxDrawer id={openTx} onClose={() => setOpenTx(null)} />
    </>
  );
}

function DemoPanel({ onDone, onVerify }: { onDone: () => void; onVerify: () => Promise<void> }) {
  const { data: health } = useHealth();
  const refresh = useRefreshAll();
  const { pushToast, setRunning } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<unknown>(null);
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

  const tamper = (mode: "quantity" | "verdict" | "header" | "rewrite") =>
    run(mode, async () => {
      const r = await api.post<{ block_index: number; change: string; tx_id?: string }>("/dev/tamper", {
        mode,
      });
      pushToast({ tone: "danger", title: `Insider edit in block #${r.block_index}`, body: r.change });
      setParams({ block: String(r.block_index) });
      refresh();
      await onVerify();
    });

  return (
    <Card className="self-start xl:col-span-4">
      <CardTitle title="Attack simulation" sub="Demo mode: edit the database behind the ledger's back" />
      <div className="space-y-2">
        <DemoButton
          icon={<Hammer size={15} />}
          title="Inflate a sealed quantity ×10"
          body="A trader edits a past invoice to claim more goods."
          onClick={() => tamper("quantity")}
          busy={busy === "quantity"}
        />
        <DemoButton
          icon={<Skull size={15} />}
          title="Flip a REJECTED fraud verdict"
          body="A corrupt insider erases an auditor's rejection."
          onClick={() => tamper("verdict")}
          busy={busy === "verdict"}
        />
        <DemoButton
          icon={<Boxes size={15} />}
          title="Edit a block header (nonce)"
          body="Breaks the proof-of-work / header hash."
          onClick={() => tamper("header")}
          busy={busy === "header"}
        />
        <DemoButton
          icon={<KeyRound size={15} />}
          title="Rewrite history and re-mine"
          body="Edit a record, recompute every hash and redo the proof-of-work. Only signatures catch it."
          onClick={() => tamper("rewrite")}
          busy={busy === "rewrite"}
        />
        <button
          onClick={() =>
            run("reset", async () => {
              setRunning(false);
              await api.post("/dev/reset");
              onDone();
              setParams({});
              refresh();
              pushToast({ tone: "ok", title: "Demo reset", body: "Fresh history re-seeded and re-mined." });
            })
          }
          disabled={!!busy}
          className="btn-ghost mt-2 flex w-full items-center justify-center gap-2 py-2.5 text-sm"
        >
          <RotateCcw size={14} /> {busy === "reset" ? "Re-seeding…" : "Reset demo data"}
        </button>
        {err !== null && <ErrorBox error={err} />}
      </div>
    </Card>
  );
}

function DemoButton({
  icon,
  title,
  body,
  onClick,
  busy,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="card-inner flex w-full items-start gap-3 p-3 text-left transition hover:border-quar/60"
    >
      <span className="mt-0.5 text-quar-ink">{icon}</span>
      <span>
        <span className="block text-sm font-medium text-ink">{busy ? "Working…" : title}</span>
        <span className="block text-[11px] text-muted">{body}</span>
      </span>
    </button>
  );
}

function BlockPanel({ index, onOpenTx }: { index: number; onOpenTx: (id: string) => void }) {
  const { data: b, isLoading, error, refetch } = useBlock(index);
  const [proofPos, setProofPos] = useState<number | null>(null);
  useEffect(() => setProofPos(null), [index]);
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
        <CardTitle
          title={`Block #${b.index}`}
          sub={clock(b.timestamp)}
          right={
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${
                b.valid
                  ? "border-clear/50 bg-clear/15 text-clear-ink"
                  : "border-quar/50 bg-quar/15 text-quar-ink"
              }`}
            >
              {b.valid ? <ShieldCheck size={13} /> : <AlertOctagon size={13} />}{" "}
              {b.valid ? "Valid" : "Invalid"}
            </span>
          }
        />
        {!b.valid && (
          <p className="mb-3 rounded-2xl bg-quar/10 px-3 py-2 text-xs text-quar-ink">{b.reason}</p>
        )}
        <dl className="space-y-2.5 text-xs">
          <HashRow k="Block hash" v={b.hash} gold />
          <HashRow k="Previous hash" v={b.prev_hash} />
          <HashRow k="Merkle root" v={b.merkle_root} />
          <div className="grid grid-cols-3 gap-2">
            <Mini k="Nonce" v={b.nonce.toLocaleString()} />
            <Mini k="Difficulty" v={String(b.difficulty)} />
            <Mini k="Records" v={String(b.tx_count)} />
          </div>
        </dl>
        {b.entries.length > 0 && (
          <MerkleTree
            leaves={b.entries.map((e) => e.recomputed_hash ?? e.tx_hash)}
            root={b.merkle_root}
            highlight={proofPos}
            label={proofPos !== null ? b.entries[proofPos]?.tx?.id : undefined}
          />
        )}
      </Card>
      <Card className="lg:col-span-7">
        <CardTitle
          title="Transaction records"
          sub="Stored hash vs. recomputed hash, and the seller's signature · Prove = Merkle inclusion proof"
        />
        {b.entries.length === 0 ? (
          <p className="text-sm text-muted">Genesis block — no transactions.</p>
        ) : (
          <ul className="space-y-2">
            {b.entries.map((e) => (
              <li
                key={e.position}
                className={`card-inner p-3 transition hover:border-gold/50 ${e.tampered ? "!border-quar" : ""}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => e.tx && onOpenTx(e.tx.id)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    title="Open transaction details"
                  >
                    <span className="text-xl" aria-hidden>
                      {e.tx ? CROP_EMOJI[e.tx.crop] : "?"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-xs text-ink">{e.tx?.id}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {e.tx?.seller_name} → {e.tx?.buyer_name} · {e.tx ? inrCompact(e.tx.total_value) : ""}
                      </span>
                    </span>
                  </button>
                  <StatusBadge status={e.status} small />
                  <button
                    onClick={() => setProofPos(proofPos === e.position ? null : e.position)}
                    aria-pressed={proofPos === e.position}
                    title="Show the Merkle inclusion proof for this record"
                    className={`pill border px-2 py-0.5 text-[10px] font-medium ${
                      proofPos === e.position
                        ? "border-gold bg-gold text-gold-ink"
                        : "border-line text-ink-2 hover:border-gold"
                    }`}
                  >
                    Prove
                  </button>
                </div>
                <div className="mt-2 grid gap-1 font-mono text-[10px]">
                  <span className="text-muted">stored&nbsp;&nbsp;&nbsp;&nbsp;{shortHash(e.tx_hash, 20)}</span>
                  <span className={e.recomputed_hash !== e.tx_hash ? "text-quar-ink" : "text-clear-ink"}>
                    recomputed {shortHash(e.recomputed_hash, 20)}{" "}
                    {e.recomputed_hash !== e.tx_hash ? "✗ MISMATCH" : "✓ matches"}
                  </span>
                  {e.tx && (
                    <span className={e.tx.signature_valid ? "text-clear-ink" : "text-quar-ink"}>
                      signature&nbsp;{" "}
                      {e.tx.signature_valid
                        ? "✓ valid for seller's key"
                        : e.status === "REJECTED"
                          ? "✗ forged (sealed as rejected evidence)"
                          : "✗ INVALID"}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
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

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Rebuilds the Merkle tree in the browser from today's record hashes — same algorithm as the backend.
 *  With `highlight`, shows the inclusion proof for that leaf: its path (gold) and the sibling hashes
 *  (dashed) a verifier needs. */
function MerkleTree({
  leaves,
  root,
  highlight = null,
  label,
}: {
  leaves: string[];
  root: string;
  highlight?: number | null;
  label?: string;
}) {
  const [levels, setLevels] = useState<string[][] | null>(null);
  const key = leaves.join(",");
  useEffect(() => {
    let alive = true;
    (async () => {
      const out: string[][] = [leaves];
      let level = [...leaves];
      while (level.length > 1) {
        if (level.length % 2) level.push(level[level.length - 1]);
        const next: string[] = [];
        for (let i = 0; i < level.length; i += 2) next.push(await sha256(level[i] + level[i + 1]));
        out.push(next);
        level = next;
      }
      if (alive) setLevels(out);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!levels) return null;
  const computedRoot = levels[levels.length - 1][0];
  const match = computedRoot === root;
  // Path index per level (bottom-up) for the highlighted leaf.
  const pathIdx = highlight === null ? [] : levels.map((_, d) => highlight >> d);
  const siblings = levels.length - 1;
  return (
    <div className="mt-5">
      <p className="mb-2 text-[11px] uppercase tracking-wider text-muted">
        Merkle tree — rebuilt in your browser from today's data
      </p>
      <div className="space-y-2">
        {levels
          .map((lvl, d) => ({ lvl, d }))
          .reverse()
          .map(({ lvl, d }) => (
            <div key={d} className="flex justify-center gap-1.5">
              {lvl.map((h, j) => {
                const isRoot = d === levels.length - 1;
                const onPath = highlight !== null && pathIdx[d] === j;
                const isSibling = highlight !== null && !isRoot && (pathIdx[d] ^ 1) === j;
                const base = isRoot
                  ? match
                    ? "border-gold/60 text-gold"
                    : "border-quar text-quar-ink"
                  : "border-line text-muted";
                return (
                  <span
                    key={j}
                    title={h}
                    className={`rounded-lg border px-1.5 py-1 font-mono text-[9px] transition ${
                      onPath
                        ? "border-gold bg-gold text-gold-ink"
                        : isSibling
                          ? "border-dashed border-gold text-gold"
                          : base
                    }`}
                  >
                    {h.slice(0, 6)}
                  </span>
                );
              })}
            </div>
          ))}
      </div>
      <p className={`mt-2 text-center text-[11px] ${match ? "text-clear-ink" : "text-quar-ink"}`}>
        {match ? "✓ Root matches the block header" : "✗ Root differs from the block header"}
      </p>
      {highlight !== null && (
        <p className="mt-2 rounded-2xl bg-panel-2 px-3 py-2 text-center text-[11px] text-ink-2">
          Inclusion proof for <span className="font-mono text-gold">{label}</span>: hash it with the{" "}
          {siblings} dashed sibling hash{siblings === 1 ? "" : "es"} going up — if you reach the root, the
          record is in this block. {siblings} hashes instead of all {leaves.length} records.
        </p>
      )}
    </div>
  );
}
