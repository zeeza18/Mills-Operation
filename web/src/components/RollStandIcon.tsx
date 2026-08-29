import { useId } from "react";

interface Props {
  color: string;
  isAlerting: boolean;
  size?: number;
}

export function RollStandIcon({ color, isAlerting, size = 72 }: Props) {
  const uid = useId();
  const rollGradId = `roll-gradient-${uid}`;

  const w = size;
  const h = size * 0.62;

  const baseY = h * 0.86;
  const baseH = h * 0.08;

  const rollX1 = w * 0.24;
  const rollX2 = w * 0.96;
  const rollH = h * 0.3;
  const rollY = h * 0.42;
  const rollCy = rollY + rollH / 2;
  const capRx = rollH * 0.4;

  const armXs = [w * 0.42, w * 0.63, w * 0.84];
  const armW = w * 0.045;

  const boxX = w * 0.03;
  const boxW = w * 0.14;
  const boxY = h * 0.32;
  const boxH = h * 0.54;

  return (
    <div className="relative flex items-center justify-center" style={{ width: w, height: h }}>
      {isAlerting && (
        <span
          className="absolute rounded-full animate-ping"
          style={{
            width: (rollX2 - rollX1) * 0.7,
            height: rollH * 1.4,
            top: rollCy - (rollH * 1.4) / 2,
            backgroundColor: "var(--color-alert)",
            opacity: 0.25,
          }}
        />
      )}
      <svg
        width={w}
        height={h}
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Roll stand"
        className={isAlerting ? "alert-shake" : undefined}
      >
        <defs>
          <linearGradient id={rollGradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="white" stopOpacity="0.4" />
            <stop offset="35%" stopColor="white" stopOpacity="0" />
            <stop offset="75%" stopColor="black" stopOpacity="0.18" />
            <stop offset="100%" stopColor="black" stopOpacity="0.38" />
          </linearGradient>
        </defs>

        {/* base rail */}
        <rect x={w * 0.02} y={baseY} width={w * 0.96} height={baseH} rx={baseH * 0.3} fill="#20242c" />

        {/* control box, left end */}
        <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={1.5} fill="#2b2f3a" />
        <circle cx={boxX + boxW * 0.32} cy={boxY + boxH * 0.28} r={boxW * 0.16} fill="#c8ccd2" />
        <circle cx={boxX + boxW * 0.68} cy={boxY + boxH * 0.28} r={boxW * 0.16} fill="#c8ccd2" />
        <rect
          x={boxX + boxW * 0.18}
          y={boxY + boxH * 0.55}
          width={boxW * 0.64}
          height={boxH * 0.28}
          rx={1}
          fill="#3f4552"
        />

        {/* warning beacon mounted on the control box */}
        <line
          x1={boxX + boxW / 2}
          y1={boxY}
          x2={boxX + boxW / 2}
          y2={boxY - h * 0.12}
          stroke="#3f4552"
          strokeWidth={1.2}
        />
        {isAlerting && (
          <circle
            className="beacon-halo"
            cx={boxX + boxW / 2}
            cy={boxY - h * 0.12}
            r={boxW * 0.34}
            fill="var(--color-alert)"
          />
        )}
        <circle
          cx={boxX + boxW / 2}
          cy={boxY - h * 0.12}
          r={boxW * 0.22}
          fill={isAlerting ? "var(--color-alert)" : "#98a1ab"}
          className={isAlerting ? "beacon-strobe" : undefined}
        />
        <circle
          cx={boxX + boxW / 2 - boxW * 0.06}
          cy={boxY - h * 0.12 - boxW * 0.06}
          r={boxW * 0.07}
          fill="white"
          opacity={isAlerting ? 0.75 : 0.35}
        />

        {/* bearing support arms, drawn behind the roll so it looks cradled */}
        {armXs.map((x) => (
          <g key={x}>
            <rect x={x - armW / 2} y={h * 0.2} width={armW} height={baseY - h * 0.2} rx={armW * 0.4} fill="#e4e7eb" stroke="#9aa1ab" strokeWidth={0.6} />
            <circle cx={x} cy={h * 0.24} r={armW * 1.15} fill="#eef0f3" stroke="#9aa1ab" strokeWidth={0.7} />
            <circle cx={x} cy={h * 0.24} r={armW * 0.4} fill="#9aa1ab" />
          </g>
        ))}

        {/* roll shadow on the base */}
        <ellipse cx={(rollX1 + rollX2) / 2} cy={baseY + baseH * 0.4} rx={(rollX2 - rollX1) / 2 - 2} ry={1.6} fill="black" opacity={0.15} />

        {/* the roll itself, on top of the arms */}
        <rect
          x={rollX1}
          y={rollY}
          width={rollX2 - rollX1}
          height={rollH}
          rx={capRx}
          fill={color}
          stroke={isAlerting ? "var(--color-alert)" : "black"}
          strokeOpacity={isAlerting ? 1 : 0.25}
          strokeWidth={isAlerting ? 1.5 : 0.75}
        />
        <rect x={rollX1} y={rollY} width={rollX2 - rollX1} height={rollH} rx={capRx} fill={`url(#${rollGradId})`} />

        {/* segment lines, like joined roller sections */}
        {[0.4, 0.55, 0.7, 0.85].map((frac) => (
          <line
            key={frac}
            x1={rollX1 + (rollX2 - rollX1) * frac}
            y1={rollY + 1.5}
            x2={rollX1 + (rollX2 - rollX1) * frac}
            y2={rollY + rollH - 1.5}
            stroke="black"
            strokeOpacity={0.15}
            strokeWidth={1}
          />
        ))}

        {/* rounded end cap */}
        <ellipse cx={rollX2 - capRx * 0.5} cy={rollCy} rx={capRx * 0.5} ry={rollH * 0.46} fill="black" opacity={0.12} />

        {/* specular highlight streak along the barrel */}
        <rect
          x={rollX1 + capRx}
          y={rollY + rollH * 0.12}
          width={rollX2 - rollX1 - capRx * 2.4}
          height={rollH * 0.16}
          rx={rollH * 0.08}
          fill="white"
          opacity={0.3}
        />
      </svg>
    </div>
  );
}
