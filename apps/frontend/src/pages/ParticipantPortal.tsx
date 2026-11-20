import {
  ArrowRight,
  Boxes,
  Building,
  CheckCircle2,
  ExternalLink,
  Factory,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Split,
  Store,
  ThermometerSnowflake,
  Truck,
  Users,
  Wheat,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  useIncomingTransfers,
  useNotifications,
  useOutgoingTransfers,
  useParticipantBatches,
  useParticipantDashboard,
} from "../api/hooks";
import { HarvestModal } from "../components/modals/HarvestModal";
import { ProcessingModal } from "../components/modals/ProcessingModal";
import { ReceiveModal } from "../components/modals/ReceiveModal";
import { TransferModal } from "../components/modals/TransferModal";
import { formatCryptoHash, formatKg, formatTime } from "../lib/format";
import { useApp } from "../state/AppState";

export default function ParticipantPortal() {
  const { activeUser } = useApp();
  const { data: dashboard, isLoading: dashLoading, refetch } = useParticipantDashboard();
  const { data: batches } = useParticipantBatches();
  const { data: incomingTransfers } = useIncomingTransfers();
  const { data: outgoingTransfers } = useOutgoingTransfers();
  const { data: notifData, isLoading: notificationsLoading } = useNotifications(
    activeUser?.participant_id,
    activeUser?.role,
    false
  );

  // Modals state
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [processingOpen, setProcessingOpen] = useState(false);

  const [activeTransferForReceive, setActiveTransferForReceive] = useState<any>(null);
  const [activeBatchForTransfer, setActiveBatchForTransfer] = useState<any>(null);

  const role = activeUser?.role || "FARMER";
  const participant = dashboard?.participant;
  const notifications = notifData?.notifications || [];

  if (!activeUser) return null;

  if (dashLoading) {
    return <div className="p-12 text-center text-xs text-muted">Loading participant workspace...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Participant Profile Banner */}
      <div className="rounded-3xl border border-line bg-panel p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold border border-gold/30">
              {role === "FARMER" && <Wheat size={26} />}
              {role === "COOP" && <Users size={26} />}
              {role === "PROCESSOR" && <Factory size={26} />}
              {role === "DISTRIBUTOR" && <Truck size={26} />}
              {role === "RETAILER" && <Store size={26} />}
              {(role === "ADMIN" || role === "AUDITOR") && <Building size={26} />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-ink">{activeUser.name}</h1>
                <span className="rounded-full bg-gold px-2.5 py-0.5 text-[10px] font-bold text-gold-ink">
                  {role} WORKSPACE
                </span>
              </div>
              <p className="mt-1 text-xs text-muted flex items-center gap-2">
                <span>Org ID: <strong className="text-ink font-mono">{activeUser.participant_id || "SYSTEM"}</strong></span>
                <span>·</span>
                <span className="flex items-center gap-1">
                  <MapPin size={12} className="text-gold" /> {participant?.region || "Maharashtra"}
                </span>
                <span>·</span>
                <span>Role: {role}</span>
              </p>
            </div>
          </div>

          {/* Quick Action Button for Role */}
          <div className="flex items-center gap-2">
            {role === "FARMER" && (
              <button
                onClick={() => setHarvestOpen(true)}
                className="btn-gold flex items-center gap-2 px-4 py-2.5 text-xs font-bold shadow-lg"
              >
                <Plus size={15} /> Register Harvest Batch
              </button>
            )}

            {role === "COOP" && (
              <button
                onClick={() => {
                  if (incomingTransfers && incomingTransfers.length > 0) {
                    setActiveTransferForReceive(incomingTransfers[0]);
                    setReceiveOpen(true);
                  }
                }}
                className="btn-gold flex items-center gap-2 px-4 py-2.5 text-xs font-bold shadow-lg"
              >
                <Scale size={15} /> Inward & Weigh Handoff
              </button>
            )}

            {role === "PROCESSOR" && (
              <button
                onClick={() => {
                  const candidate =
                    (batches || []).find(
                      (b) => (b.current_quantity_kg ?? b.current_quantity ?? 0) > 0 && b.status !== "PROCESSED"
                    ) || (batches && batches.length > 0 ? batches[0] : null);
                  if (candidate) {
                    setActiveBatchForTransfer(candidate);
                  }
                  setProcessingOpen(true);
                }}
                className="btn-gold flex items-center gap-2 px-4 py-2.5 text-xs font-bold shadow-lg"
              >
                <Split size={15} /> Record Processing & Split
              </button>
            )}

            {role === "DISTRIBUTOR" && (
              <button
                onClick={() => {
                  if (batches && batches.length > 0) {
                    setActiveBatchForTransfer(batches[0]);
                    setTransferOpen(true);
                  }
                }}
                className="btn-gold flex items-center gap-2 px-4 py-2.5 text-xs font-bold shadow-lg"
              >
                <Truck size={15} /> Create Outward Dispatch
              </button>
            )}

            {role === "RETAILER" && (
              <button
                onClick={() => {
                  if (incomingTransfers && incomingTransfers.length > 0) {
                    setActiveTransferForReceive(incomingTransfers[0]);
                    setReceiveOpen(true);
                  }
                }}
                className="btn-gold flex items-center gap-2 px-4 py-2.5 text-xs font-bold shadow-lg"
              >
                <Store size={15} /> Accept Retail Delivery
              </button>
            )}

            <button onClick={() => refetch()} className="btn-ghost px-3 py-2 text-xs">
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        {/* Public Key Fingerprint */}
        <div className="mt-4 pt-4 border-t border-line/60 flex flex-wrap items-center justify-between text-xs text-muted">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <ShieldCheck size={14} className="text-emerald-400" />
            <span>Ed25519 Public Key:</span>
            <code className="text-gold font-bold">
              {participant?.id ? formatCryptoHash(participant.id + "00000000000000000000000000000000") : "Active Identity Key Registered"}
            </code>
          </div>
          <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
            <CheckCircle2 size={12} /> Authorized Signer on Ledger
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-line bg-panel p-4">
          <span className="text-xs text-muted block">My Active Batches</span>
          <div className="mt-1 text-2xl font-bold text-ink tnum">
            {dashboard?.active_batches_count || batches?.length || 0}
          </div>
          <span className="text-[11px] text-muted block mt-1">In local inventory / custody</span>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <span className="text-xs text-muted block">Incoming Transfers</span>
          <div className="mt-1 text-2xl font-bold text-gold tnum">
            {dashboard?.pending_inward_transfers || incomingTransfers?.length || 0}
          </div>
          <span className="text-[11px] text-muted block mt-1">Awaiting weighbridge acceptance</span>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <span className="text-xs text-muted block">Dispatches Completed</span>
          <div className="mt-1 text-2xl font-bold text-ink tnum">
            {dashboard?.total_dispatches || outgoingTransfers?.length || 0}
          </div>
          <span className="text-[11px] text-muted block mt-1">Signed outward handoffs</span>
        </div>

        <div className="rounded-2xl border border-line bg-panel p-4">
          <span className="text-xs text-muted block">Disputed Transfers</span>
          <div className={`mt-1 text-2xl font-bold tnum ${(dashboard?.disputed_transfers_count || 0) > 0 ? "text-quar" : "text-emerald-400"}`}>
            {dashboard?.disputed_transfers_count || 0}
          </div>
          <span className="text-[11px] text-muted block mt-1">Weight / tolerance exceptions</span>
        </div>
      </div>

      {/* Role-Specific Main Section: Harvest Stocks for Farmer, Inward Queue for Receiving Roles */}
      {role === "FARMER" ? (
        <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Wheat size={17} className="text-gold" /> Active Harvest Stocks & Ready for Dispatch
              </h2>
              <p className="text-xs text-muted">
                Harvest lots registered by your farm. Ready for outward dispatch to cooperatives and food processors.
              </p>
            </div>
            <button
              onClick={() => setHarvestOpen(true)}
              className="btn-gold flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold shadow"
            >
              <Plus size={14} /> Register Harvest
            </button>
          </div>

          {batches && batches.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {batches.slice(0, 4).map((b) => (
                <div
                  key={b.id}
                  className="rounded-xl border border-line bg-panel-2 p-3.5 text-xs flex justify-between items-center gap-3 hover:border-gold/50 transition"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gold">{b.id}</span>
                      <span className="font-bold text-ink">{b.crop}</span>
                      {b.is_organic ? (
                        <span className="rounded bg-emerald-500/10 text-emerald-400 px-1.5 py-0.2 text-[9px] font-bold">
                          ORGANIC
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-muted mt-1">
                      {formatKg(b.current_quantity_kg ?? b.current_quantity ?? 0)} available · Grade {b.quality_grade || "A"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setActiveBatchForTransfer(b);
                      setTransferOpen(true);
                    }}
                    className="btn-ghost flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gold"
                  >
                    <Truck size={13} /> Dispatch
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted">
              No active harvest lots in inventory. Click "Register Harvest Batch" to record your produce.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Truck size={17} className="text-gold" /> Inward Handoff Queue (Pending Acceptance)
              </h2>
              <p className="text-xs text-muted">
                Produce dispatched to your organization. Weigh on arrival and verify quantity against tolerance.
              </p>
            </div>
          </div>

          {incomingTransfers && incomingTransfers.length > 0 ? (
            <div className="space-y-3">
              {incomingTransfers.map((trf) => (
                <div
                  key={trf.id}
                  className="rounded-xl border border-line bg-panel-2 p-4 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gold">{trf.id}</span>
                      <span className="rounded bg-panel px-2 py-0.5 text-ink font-semibold">
                        Batch: {trf.batch_id}
                      </span>
                      <span
                        className={`rounded px-2 py-0.5 font-bold ${
                          trf.status === "ACCEPTED"
                            ? "bg-clear/20 text-clear"
                            : trf.status === "IN_TRANSIT"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-quar/20 text-quar"
                        }`}
                      >
                        {trf.status}
                      </span>
                    </div>
                    <div className="mt-1 text-muted">
                      Sender: <strong className="text-ink">{trf.sender_name || trf.sender_id}</strong> · Vehicle:{" "}
                      <code className="text-ink-2 font-mono">{trf.vehicle_number || "MH-12-TR-9421"}</code>
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-muted block text-[11px]">Declared Weight</span>
                      <span className="font-bold text-base text-ink tnum">
                        {formatKg(trf.dispatched_quantity_kg)}
                      </span>
                    </div>

                    {trf.status === "IN_TRANSIT" ? (
                      <button
                        onClick={() => {
                          setActiveTransferForReceive(trf);
                          setReceiveOpen(true);
                        }}
                        className="btn-gold px-4 py-2 font-bold flex items-center gap-1.5 shadow"
                      >
                        <Scale size={14} /> Weigh & Inward
                      </button>
                    ) : (
                      <div className="text-right">
                        <span className="text-muted block text-[11px]">Received Weight</span>
                        <span className="font-bold text-ink tnum">
                          {formatKg(trf.received_quantity_kg || 0)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted">No pending incoming shipments in inward queue.</p>
          )}
        </div>
      )}

      {/* Live Chain Activity & Alerts Feed */}
      <div className="rounded-2xl border border-line bg-panel p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div>
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Radio size={17} className="text-gold animate-pulse" /> Live Chain Updates & Consignment Alerts
            </h2>
            <p className="text-xs text-muted">
              Real-time ledger events, weighbridge variances, and custody handoffs affecting your supply chain.
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
            Live Stream Active
          </span>
        </div>

        {notificationsLoading ? (
          <p className="py-6 text-center text-xs text-muted">Polling live chain activity...</p>
        ) : notifications && notifications.length > 0 ? (
          <div className="space-y-2.5">
            {notifications.slice(0, 5).map((notif) => {
              const isAlert = notif.severity === "CRITICAL" || notif.category === "DISPUTE";
              return (
                <div
                  key={notif.id}
                  className={`rounded-xl border p-3.5 flex flex-wrap sm:flex-nowrap items-start justify-between gap-3 text-xs transition ${
                    isAlert
                      ? "border-rose-500/30 bg-rose-500/5 hover:bg-rose-500/10"
                      : "border-line bg-panel-2 hover:bg-panel-3"
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${
                        isAlert ? "bg-rose-500/15 border-rose-500/30 text-rose-400" : "bg-panel border-line text-gold"
                      }`}
                    >
                      {notif.category === "DISPUTE" && <Scale size={15} />}
                      {notif.category === "COLD_CHAIN" && <ThermometerSnowflake size={15} />}
                      {notif.category === "QUARANTINE" && <ShieldAlert size={15} />}
                      {notif.category === "TRANSFER" && <Truck size={15} />}
                      {notif.category === "LIFECYCLE" && <Boxes size={15} />}
                      {notif.category === "AUDIT" && <ShieldCheck size={15} />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-ink">{notif.title}</span>
                        <span
                          className={`rounded px-1.5 py-0.2 text-[9px] font-mono font-bold uppercase ${
                            notif.severity === "CRITICAL"
                              ? "bg-rose-500/20 text-rose-400"
                              : notif.severity === "WARNING"
                              ? "bg-amber-500/20 text-amber-400"
                              : "bg-panel border border-line text-gold"
                          }`}
                        >
                          {notif.category}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted leading-relaxed">{notif.message}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 self-center sm:self-start">
                    {notif.batch_id && (
                      <Link
                        to={role === "ADMIN" || role === "AUDITOR" ? `/admin/lifecycle?id=${notif.batch_id}` : `/portal/batches`}
                        className="font-mono text-gold font-bold hover:underline flex items-center gap-1"
                      >
                        <span>{notif.batch_id}</span>
                        <ExternalLink size={11} />
                      </Link>
                    )}
                    {notif.created_at && (
                      <span className="text-[10px] text-muted font-mono">{formatTime(notif.created_at)}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="py-6 text-center text-xs text-muted">No recent chain updates for your account.</p>
        )}
      </div>

      {/* Quick Navigation Cards to Dedicated Views */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          to="/portal/batches"
          className="rounded-2xl border border-line bg-panel p-4 flex items-center justify-between gap-4 hover:border-gold/60 transition group"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold border border-gold/30">
              <Boxes size={20} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm group-hover:text-gold transition">
                Manage Lot Inventory & Stocks
              </h3>
              <p className="text-xs text-muted">Inspect batch attributes, quality certificates and dispatch outward.</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-muted group-hover:text-gold transition shrink-0" />
        </Link>

        <Link
          to="/portal/transfers"
          className="rounded-2xl border border-line bg-panel p-4 flex items-center justify-between gap-4 hover:border-gold/60 transition group"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
              <Truck size={20} />
            </div>
            <div>
              <h3 className="font-bold text-ink text-sm group-hover:text-sky-400 transition">
                Logistics & Weighbridge History
              </h3>
              <p className="text-xs text-muted">Review incoming handoffs, vehicle tracking and tolerance audits.</p>
            </div>
          </div>
          <ArrowRight size={16} className="text-muted group-hover:text-sky-400 transition shrink-0" />
        </Link>
      </div>

      {/* Modals */}
      <HarvestModal
        isOpen={harvestOpen}
        onClose={() => setHarvestOpen(false)}
        farmerId={activeUser.participant_id || "F-001"}
        acres={(participant as any)?.land_acres || 6.5}
      />

      <TransferModal
        isOpen={transferOpen}
        onClose={() => setTransferOpen(false)}
        batchId={activeBatchForTransfer?.id || ""}
        senderId={activeUser.participant_id || "F-001"}
        availableKg={activeBatchForTransfer?.current_quantity_kg || 4000}
      />

      <ReceiveModal
        isOpen={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        transfer={activeTransferForReceive}
        receiverId={activeUser.participant_id || "C-001"}
      />

      <ProcessingModal
        isOpen={processingOpen}
        onClose={() => setProcessingOpen(false)}
        batchId={activeBatchForTransfer?.id}
        preselectedBatch={activeBatchForTransfer}
        processorId={activeUser.participant_id || "P-001"}
        availableKg={activeBatchForTransfer?.current_quantity_kg ?? activeBatchForTransfer?.current_quantity ?? 4000}
      />
    </div>
  );
}
