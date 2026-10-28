import type { Decision } from "../api/types";

export function inrCompact(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)} L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)} K`;
  return `₹${v.toFixed(0)}`;
}

export function inr(v: number, digits = 2): string {
  return `₹${v.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function kg(v: number): string {
  return v >= 1000
    ? `${(v / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 })} t`
    : `${v.toFixed(0)} kg`;
}

export function num(v: number): string {
  return v.toLocaleString("en-IN");
}

export function pct(v: number, digits = 0): string {
  return `${(v * 100).toFixed(digits)}%`;
}

export function shortHash(h: string | null | undefined, n = 6): string {
  if (!h) return "—";
  return `0x${h.slice(0, n)}…${h.slice(-4)}`;
}

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function clock(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export const STAGE_LABEL: Record<string, string> = {
  FARM_TO_COOP: "Farm → Cooperative",
  COOP_TO_PROCESSOR: "Cooperative → Processor",
  PROCESSOR_TO_DISTRIBUTOR: "Processor → Distributor",
  DISTRIBUTOR_TO_RETAILER: "Distributor → Retailer",
};

export const ROLE_LABEL: Record<string, string> = {
  FARMER: "Farmer",
  COOP: "Cooperative",
  PROCESSOR: "Processor",
  DISTRIBUTOR: "Distributor",
  RETAILER: "Retailer",
};

export const CROP_EMOJI: Record<string, string> = {
  wheat: "🌾",
  rice: "🍚",
  soybean: "🫘",
  onion: "🧅",
  tomato: "🍅",
  mango: "🥭",
};

export function decisionFor(risk: number, flag = 0.4, quarantine = 0.7): Decision {
  if (risk >= quarantine) return "QUARANTINED";
  if (risk >= flag) return "FLAGGED";
  return "CLEAR";
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** 0x-prefixed Ethereum hash or address, shortened: 0x1234ab…9f3c */
export function ethShort(h: string | null | undefined, n = 6): string {
  if (!h) return "—";
  return `${h.slice(0, n + 2)}…${h.slice(-4)}`;
}

export function unixClock(seconds: number): string {
  return clock(new Date(seconds * 1000).toISOString());
}
