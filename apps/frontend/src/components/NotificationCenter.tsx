import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  Boxes,
  Check,
  CheckCheck,
  ExternalLink,
  Radio,
  Scale,
  ShieldAlert,
  ShieldCheck,
  ThermometerSnowflake,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../api/hooks";
import type { ChainNotification } from "../api/types";
import { formatTime } from "../lib/format";
import { useApp } from "../state/AppState";

export function NotificationCenter() {
  const { activeUser, pushToast } = useApp();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "UNREAD" | "ALERTS" | "LIFECYCLE">("ALL");
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const { data, isLoading } = useNotifications(
    activeUser?.participant_id,
    activeUser?.role,
    false
  );

  const markReadMut = useMarkNotificationRead();
  const markAllMut = useMarkAllNotificationsRead();

  if (!activeUser) return null;

  const notifications = data?.notifications || [];
  const unreadCount = data?.unread_count || 0;

  // Track previous unread count to show toast on new incoming alerts
  const prevCount = useRef(unreadCount);
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      const newest = notifications.find((n) => !n.read);
      if (newest) {
        pushToast({
          tone: newest.severity === "CRITICAL" ? "danger" : newest.severity === "WARNING" ? "warn" : "info",
          title: newest.title,
          body: newest.message,
        });
      }
    }
    prevCount.current = unreadCount;
  }, [unreadCount, notifications, pushToast]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Filtered notifications
  const filtered = notifications.filter((n) => {
    if (filter === "UNREAD") return !n.read;
    if (filter === "ALERTS")
      return (
        n.severity === "CRITICAL" ||
        n.severity === "WARNING" ||
        n.category === "DISPUTE" ||
        n.category === "COLD_CHAIN" ||
        n.category === "QUARANTINE"
      );
    if (filter === "LIFECYCLE") return n.category === "LIFECYCLE" || n.category === "TRANSFER";
    return true;
  });

  const getCategoryIcon = (category: ChainNotification["category"], severity: ChainNotification["severity"]) => {
    if (category === "COLD_CHAIN") return <ThermometerSnowflake size={15} className="text-rose-400" />;
    if (category === "DISPUTE") return <Scale size={15} className="text-amber-400" />;
    if (category === "QUARANTINE") return <ShieldAlert size={15} className="text-rose-400" />;
    if (category === "TRANSFER") return <Truck size={15} className="text-sky-400" />;
    if (category === "AUDIT") return <ShieldCheck size={15} className="text-purple-400" />;
    if (severity === "CRITICAL") return <AlertOctagon size={15} className="text-rose-400" />;
    if (severity === "WARNING") return <AlertTriangle size={15} className="text-amber-400" />;
    return <Boxes size={15} className="text-emerald-400" />;
  };

  const getSeverityBadge = (severity: ChainNotification["severity"]) => {
    switch (severity) {
      case "CRITICAL":
        return "bg-rose-500/20 text-rose-400 border border-rose-500/30";
      case "WARNING":
        return "bg-amber-500/20 text-amber-400 border border-amber-500/30";
      case "SUCCESS":
        return "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
      default:
        return "bg-panel text-gold border border-gold/30";
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Trigger Button */}
      <button
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Live Chain Notifications: ${unreadCount} unread`}
        className={`relative flex h-9 w-9 items-center justify-center rounded-xl border transition ${
          open
            ? "border-gold bg-gold/15 text-gold shadow-md"
            : unreadCount > 0
              ? "border-line bg-panel text-ink hover:border-gold/60"
              : "border-line bg-panel text-ink-2 hover:text-ink"
        }`}
        title={`Live Chain Updates (${unreadCount} unread)`}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <>
            <span className="tnum absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-quar px-1 text-[9px] font-bold text-white shadow-md animate-pulse">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
            <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-quar opacity-75 animate-ping" />
          </>
        )}
      </button>

      {/* Slide-in Popover Drawer */}
      {open && (
        <div className="slide-in absolute right-0 top-[calc(100%+8px)] z-50 w-[380px] sm:w-[420px] rounded-3xl border border-line bg-panel-2 p-0 shadow-2xl overflow-hidden backdrop-blur-xl">
          {/* Header */}
          <div className="border-b border-line bg-panel p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/15 text-gold border border-gold/30">
                  <Radio size={14} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-ink uppercase tracking-wider flex items-center gap-1.5">
                    Live Chain Updates
                    {unreadCount > 0 && (
                      <span className="rounded-full bg-quar/20 text-quar px-1.5 py-0.2 text-[9px] font-bold font-mono">
                        {unreadCount} UNREAD
                      </span>
                    )}
                  </h3>
                  <p className="text-[10px] text-muted">
                    Filtered for <strong className="text-ink">{activeUser.name}</strong> ({activeUser.role})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {unreadCount > 0 && (
                  <button
                    onClick={() => {
                      markAllMut.mutate({
                        participantId: activeUser.participant_id,
                        role: activeUser.role,
                      });
                    }}
                    disabled={markAllMut.isPending}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-gold hover:bg-gold/10 transition"
                    title="Mark all notifications as read"
                  >
                    <CheckCheck size={12} />
                    <span>Mark all read</span>
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg p-1 text-muted hover:text-ink transition"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="mt-3 flex gap-1 rounded-xl bg-panel-2 p-1 border border-line text-[10px] font-bold">
              <button
                onClick={() => setFilter("ALL")}
                className={`flex-1 rounded-lg py-1 transition ${
                  filter === "ALL" ? "bg-panel text-gold shadow-sm font-extrabold" : "text-muted hover:text-ink"
                }`}
              >
                All ({notifications.length})
              </button>
              <button
                onClick={() => setFilter("UNREAD")}
                className={`flex-1 rounded-lg py-1 transition ${
                  filter === "UNREAD" ? "bg-panel text-gold shadow-sm font-extrabold" : "text-muted hover:text-ink"
                }`}
              >
                Unread ({unreadCount})
              </button>
              <button
                onClick={() => setFilter("ALERTS")}
                className={`flex-1 rounded-lg py-1 transition ${
                  filter === "ALERTS" ? "bg-panel text-rose-400 shadow-sm font-extrabold" : "text-muted hover:text-ink"
                }`}
              >
                Disputes & Alerts
              </button>
              <button
                onClick={() => setFilter("LIFECYCLE")}
                className={`flex-1 rounded-lg py-1 transition ${
                  filter === "LIFECYCLE" ? "bg-panel text-emerald-400 shadow-sm font-extrabold" : "text-muted hover:text-ink"
                }`}
              >
                Lifecycle
              </button>
            </div>
          </div>

          {/* Notification Items List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-line/40">
            {isLoading ? (
              <div className="p-8 text-center text-xs text-muted">Polling live ledger events...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-panel border border-line text-muted">
                  <Check size={18} className="text-emerald-400" />
                </div>
                <p className="text-xs font-semibold text-ink">All caught up!</p>
                <p className="text-[11px] text-muted max-w-xs mx-auto">
                  No active notifications matching the selected filter for your supply-chain role.
                </p>
              </div>
            ) : (
              filtered.map((n) => {
                const isDisputeOrCritical = n.severity === "CRITICAL" || n.category === "DISPUTE";
                return (
                  <div
                    key={n.id}
                    className={`p-3.5 transition text-xs flex gap-3 items-start relative ${
                      !n.read
                        ? "bg-gold/5 hover:bg-gold/10"
                        : "hover:bg-panel-3/50"
                    }`}
                  >
                    {/* Unread dot */}
                    {!n.read && (
                      <span className="absolute left-1.5 top-5 h-1.5 w-1.5 rounded-full bg-gold" />
                    )}

                    {/* Icon container */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                        isDisputeOrCritical
                          ? "bg-rose-500/10 border-rose-500/30"
                          : "bg-panel border-line"
                      }`}
                    >
                      {getCategoryIcon(n.category, n.severity)}
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-ink leading-tight truncate">
                          {n.title}
                        </span>
                        <span className={`rounded px-1.5 py-0.2 text-[8px] font-bold font-mono uppercase shrink-0 ${getSeverityBadge(n.severity)}`}>
                          {n.category}
                        </span>
                      </div>

                      <p className="text-[11px] text-muted leading-relaxed">
                        {n.message}
                      </p>

                      <div className="flex items-center justify-between pt-1 text-[10px]">
                        <div className="flex items-center gap-1.5">
                          {n.batch_id && (
                            <button
                              onClick={() => {
                                setOpen(false);
                                if (activeUser?.role === "ADMIN" || activeUser?.role === "AUDITOR") {
                                  navigate(`/admin/lifecycle?id=${encodeURIComponent(n.batch_id!)}`);
                                } else {
                                  navigate(`/portal/batches`);
                                }
                              }}
                              className="font-mono text-gold font-bold hover:underline flex items-center gap-0.5"
                            >
                              <span>{n.batch_id}</span>
                              <ExternalLink size={9} />
                            </button>
                          )}
                          {n.created_at && (
                            <span className="text-muted">· {formatTime(n.created_at)}</span>
                          )}
                        </div>

                        {!n.read && (
                          <button
                            onClick={() => markReadMut.mutate(n.id)}
                            className="text-muted hover:text-gold flex items-center gap-0.5 font-semibold"
                            title="Mark as read"
                          >
                            <Check size={11} /> Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer bar */}
          <div className="border-t border-line bg-panel px-4 py-2 flex items-center justify-between text-[10px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>Tamper-Evident Ledger Stream Active</span>
            </span>
            <span className="font-mono">Sync: 3s</span>
          </div>
        </div>
      )}
    </div>
  );
}
