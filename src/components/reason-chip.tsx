import type { CSSProperties } from "react";

// One color per movement reason, shared by every place a movement log
// shows up (metrics dashboard, scanner, bin page) — a worker should read
// "sold" vs "removed" vs "relocated" at a glance, the same way, everywhere.
const REASON_HUES: Record<string, number> = {
  receive: 150,
  relocate: 250,
  sale: 80,
  remove: 25,
};

export function ReasonChip({ reason, label }: { reason: string; label: string }) {
  const hue = REASON_HUES[reason];
  const color: CSSProperties =
    hue !== undefined
      ? { background: `color-mix(in srgb, oklch(0.56 0.1 ${hue}) 14%, #fff)`, color: `oklch(0.5 0.1 ${hue})` }
      : reason === "pick"
        ? { background: "var(--color-accent-100)", color: "var(--color-accent-800)" }
        : { background: "var(--color-neutral-100)", color: "var(--color-neutral-800)" };

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        fontSize: 10,
        letterSpacing: ".04em",
        whiteSpace: "nowrap",
        ...color,
      }}
    >
      {label}
    </span>
  );
}
