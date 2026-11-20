import { C } from "../lib/tokens";

/**
 * Sunburst risk gauge (inspired by the sun motif in the UI reference).
 * Rays light up clockwise in proportion to risk; colour encodes the decision band,
 * and the numeric value + label are always shown so colour is never the only signal.
 */
export function RiskSun({
  risk,
  size = 180,
  label,
  flag = 0.4,
  quarantine = 0.7,
}: {
  risk: number;
  size?: number;
  label?: string;
  flag?: number;
  quarantine?: number;
}) {
  const rays = 36;
  const lit = Math.round(risk * rays);
  const color = risk >= quarantine ? C.quar : risk >= flag ? C.flag : C.clear;
  const cx = size / 2;
  const r1 = size * 0.3;
  const r2 = size * 0.47;
  const decision = risk >= quarantine ? "Quarantine" : risk >= flag ? "Flag" : "Clear";
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Risk ${(risk * 100).toFixed(0)} percent — ${decision}`}
    >
      {Array.from({ length: rays }).map((_, i) => {
        const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
        const long = i % 3 === 0;
        const rr2 = long ? r2 : r2 - size * 0.05;
        const on = i < lit;
        const thresholdTick = i === Math.round(flag * rays) || i === Math.round(quarantine * rays);
        return (
          <line
            key={i}
            x1={cx + Math.cos(a) * r1}
            y1={cx + Math.sin(a) * r1}
            x2={cx + Math.cos(a) * rr2}
            y2={cx + Math.sin(a) * rr2}
            stroke={on ? color : thresholdTick ? "#55534c" : C.line}
            strokeWidth={long ? 3 : 2}
            strokeLinecap="round"
            style={{ transition: "stroke 0.4s" }}
          />
        );
      })}
      <circle cx={cx} cy={cx} r={r1 - size * 0.06} fill={C.panel2} stroke={C.line} />
      <text
        x={cx}
        y={cx + size * 0.02}
        textAnchor="middle"
        fill={C.ink}
        fontSize={size * 0.17}
        fontWeight={600}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {(risk * 100).toFixed(0)}
        <tspan fontSize={size * 0.08} fill={C.muted}>
          %
        </tspan>
      </text>
      <text
        x={cx}
        y={cx + size * 0.12}
        textAnchor="middle"
        fill={color}
        fontSize={size * 0.065}
        fontWeight={600}
      >
        {label ?? decision.toUpperCase()}
      </text>
    </svg>
  );
}

/** Static decorative sun for the brand mark. */
export function SunMark({ size = 28, color = C.gold }: { size?: number; color?: string }) {
  const c = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={c} cy={c} r={size * 0.16} fill={color} />
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        const r1 = size * 0.26;
        const r2 = i % 2 ? size * 0.4 : size * 0.48;
        return (
          <line
            key={i}
            x1={c + Math.cos(a) * r1}
            y1={c + Math.sin(a) * r1}
            x2={c + Math.cos(a) * r2}
            y2={c + Math.sin(a) * r2}
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}
