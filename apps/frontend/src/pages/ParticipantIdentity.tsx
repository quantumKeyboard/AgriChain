import { CheckCircle2, Copy, Key, Lock, Shield, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useParticipantIdentity } from "../api/hooks";
import { useApp } from "../state/AppState";

export default function ParticipantIdentity() {
  const { data: identityData, isLoading } = useParticipantIdentity();
  const { activeUser, pushToast } = useApp();
  const [copied, setCopied] = useState(false);

  if (!activeUser) return null;

  if (isLoading) {
    return <div className="p-12 text-center text-xs text-muted">Loading cryptographic identity...</div>;
  }

  const copyKey = () => {
    if (identityData?.public_key) {
      navigator.clipboard.writeText(identityData.public_key);
      setCopied(true);
      pushToast({ tone: "ok", title: "Public Key Copied", body: "Ed25519 public key copied to clipboard" });
      setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="border-b border-line pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-ink">Participant Digital Identity & Cryptographic Keys</h1>
        <p className="mt-1 text-sm text-muted">
          Your organization's non-custodial Ed25519 cryptographic identity registered on the AgriChain ledger.
        </p>
      </div>

      <div className="rounded-3xl border border-line bg-panel p-6 shadow-xl space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold border border-gold/30">
            <Key size={30} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">{identityData?.name || activeUser.name}</h2>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted">
              <span>Role: <strong className="text-gold">{identityData?.role || activeUser.role}</strong></span>
              <span>·</span>
              <span>Org ID: <strong className="text-ink font-mono">{identityData?.participant_id || "SYSTEM"}</strong></span>
              <span>·</span>
              <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                <CheckCircle2 size={13} /> Active & Registered
              </span>
            </div>
          </div>
        </div>

        {/* Public Key Display */}
        <div className="rounded-2xl border border-line bg-panel-2 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gold uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-emerald-400" /> Ed25519 Public Key (Hex Encoded)
            </span>
            <button
              onClick={copyKey}
              className="text-xs text-muted hover:text-ink flex items-center gap-1 font-semibold"
            >
              <Copy size={13} /> {copied ? "Copied!" : "Copy Public Key"}
            </button>
          </div>
          <div className="rounded-xl bg-panel p-3 border border-line/60 font-mono text-xs text-ink break-all select-all">
            {identityData?.public_key || "Generating or fetching public key..."}
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            Every transaction, dispatch, and handoff acceptance you execute is signed with your private key. The public key above is registered on the ledger so any auditor or downstream participant can mathematically verify your signature without trusting the server.
          </p>
        </div>

        {/* Security Principles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="rounded-2xl border border-line bg-panel-2 p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Lock size={15} className="text-gold" /> Non-Repudiation
            </div>
            <p className="text-muted leading-relaxed">
              Once an inward weight or outward dispatch is signed with your key, it cannot be edited or retracted by database administrators without invalidating the cryptographic signature on the blockchain.
            </p>
          </div>

          <div className="rounded-2xl border border-line bg-panel-2 p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Shield size={15} className="text-emerald-400" /> Identity Spoofing Protection
            </div>
            <p className="text-muted leading-relaxed">
              If an unauthorized entity attempts to submit an invoice in your name using an incorrect private key, the ML gatekeeper flags rule <code className="text-quar">SIGNATURE_INVALID</code> and quarantines the transaction immediately.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
