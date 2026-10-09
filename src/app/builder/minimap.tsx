"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

// The overview in the canvas corner (#204): the whole floor at thumbnail
// size, with the part on screen outlined. Click or drag in it to move the
// view there. It follows the wrapper's scroll itself, so scrolling never
// re-renders the (large) canvas just to move this rectangle.

export type MinimapShape = { id: string; xM: number; yM: number; widthM: number; heightM: number; area: boolean; color: string | null };


export function Minimap({
  wrapRef,
  floor,
  shapes,
  pxPerM,
  originX,
  originY,
  label,
  compact = false,
}: {
  wrapRef: RefObject<HTMLDivElement | null>;
  floor: { widthM: number; heightM: number };
  shapes: MinimapShape[];
  /** Screen pixels per floor metre at the current zoom. */
  pxPerM: number;
  /** Where the floor's (0,0) sits inside the wrapper's scrolled content, px. */
  originX: number;
  originY: number;
  label: string;
  /** A phone: a smaller thumbnail. */
  compact?: boolean;
}) {
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number; overflow: boolean } | null>(null);
  const dragging = useRef(false);

  const k = Math.min((compact ? 112 : 168) / floor.widthM, (compact ? 76 : 112) / floor.heightM);
  const w = floor.widthM * k;
  const h = floor.heightM * k;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let raf = 0;
    const read = () => {
      raf = 0;
      setView({
        x: (wrap.scrollLeft - originX) / pxPerM,
        y: (wrap.scrollTop - originY) / pxPerM,
        w: wrap.clientWidth / pxPerM,
        h: wrap.clientHeight / pxPerM,
        overflow: wrap.scrollWidth > wrap.clientWidth + 1 || wrap.scrollHeight > wrap.clientHeight + 1,
      });
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(read); };
    schedule();
    wrap.addEventListener("scroll", schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(wrap);
    if (wrap.firstElementChild) ro.observe(wrap.firstElementChild);
    return () => {
      wrap.removeEventListener("scroll", schedule);
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [wrapRef, pxPerM, originX, originY]);

  if (!view || !view.overflow) return null;

  function centreOn(ev: React.PointerEvent<SVGSVGElement>) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const r = ev.currentTarget.getBoundingClientRect();
    const xM = (ev.clientX - r.left) / k;
    const yM = (ev.clientY - r.top) / k;
    wrap.scrollTo({
      left: originX + xM * pxPerM - wrap.clientWidth / 2,
      top: originY + yM * pxPerM - wrap.clientHeight / 2,
    });
  }

  // The visible window, clipped to the thumbnail.
  const vx = Math.max(0, view.x * k);
  const vy = Math.max(0, view.y * k);
  const vw = Math.min(w, (view.x + view.w) * k) - vx;
  const vh = Math.min(h, (view.y + view.h) * k) - vy;

  return (
    <svg
      className="canvas-minimap"
      role="img"
      aria-label={label}
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      onPointerDown={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        dragging.current = true;
        ev.currentTarget.setPointerCapture(ev.pointerId);
        centreOn(ev);
      }}
      onPointerMove={(ev) => { if (dragging.current) centreOn(ev); }}
      onPointerUp={() => { dragging.current = false; }}
      onPointerCancel={() => { dragging.current = false; }}
    >
      <rect x={0} y={0} width={w} height={h} fill="#fff" />
      {shapes.map((s) =>
        s.area ? (
          <rect
            key={s.id}
            x={s.xM * k}
            y={s.yM * k}
            width={Math.max(0.5, s.widthM * k)}
            height={Math.max(0.5, s.heightM * k)}
            fill={s.color ? `color-mix(in srgb,${s.color} 14%,transparent)` : "none"}
            stroke={s.color ?? "var(--color-accent-300)"}
            strokeWidth={0.75}
          />
        ) : (
          <rect
            key={s.id}
            x={s.xM * k}
            y={s.yM * k}
            width={Math.max(0.75, s.widthM * k)}
            height={Math.max(0.75, s.heightM * k)}
            fill="var(--color-accent-600)"
          />
        ),
      )}
      {vw > 0 && vh > 0 && (
        <rect x={vx} y={vy} width={vw} height={vh} fill="color-mix(in srgb,var(--color-accent) 12%,transparent)" stroke="var(--color-accent)" strokeWidth={1.5} />
      )}
      <rect x={0.5} y={0.5} width={w - 1} height={h - 1} fill="none" stroke="var(--color-accent-900)" strokeWidth={1} />
    </svg>
  );
}

// A map's scale bar: the roundest length that spans 60–150 px at this zoom.
const SCALE_STEPS_M = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];

export function ScaleBar({ pxPerM }: { pxPerM: number }) {
  const m = SCALE_STEPS_M.find((s) => s * pxPerM >= 60) ?? SCALE_STEPS_M[SCALE_STEPS_M.length - 1];
  const px = m * pxPerM;
  return (
    <div className="canvas-scale" aria-hidden>
      <span style={{ display: "block", width: px, height: 6, borderLeft: "1.5px solid currentColor", borderRight: "1.5px solid currentColor", borderBottom: "1.5px solid currentColor" }} />
      <span>{m} m</span>
    </div>
  );
}
