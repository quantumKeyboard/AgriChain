// Colour tokens for charts (SVG/Recharts need raw values). Mirrors src/index.css @theme.
export const C = {
  bg: "#0a0a0a",
  panel: "#141414",
  panel2: "#1c1c1b",
  line: "#2a2a28",
  grid: "#232321",
  ink: "#f2f1ec",
  ink2: "#c3c2b7",
  muted: "#8a8983",
  gold: "#e8c15a",
  gold2: "#f3d98a",
  clear: "#27936a",
  flag: "#c08716",
  quar: "#c43b44",
};

export const STATUS_COLOR: Record<string, string> = {
  CLEAR: C.clear,
  COMMITTED: C.clear,
  APPROVED: C.clear,
  FLAGGED: C.flag,
  QUARANTINED: C.quar,
  REJECTED: C.quar,
  PENDING_REVIEW: C.quar,
  PENDING: C.muted,
};

/** Single-hue gold sequential ramp for magnitude (dark surface → gold). */
export function goldRamp(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const from = [38, 36, 30];
  const to = [232, 193, 90];
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * Math.pow(x, 0.8)));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const axisProps = {
  stroke: C.muted,
  tick: { fill: C.muted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: C.line },
} as const;
