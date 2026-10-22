import { DefectIcon, type DefectKind } from "./icons";

// The public tray photo, shown cropped to one tray. Every spot drawn on it is invented.
const PHOTO = "/photos/tray.jpg";
const FRAME = { x: 170, y: 60, w: 650, h: 480 };
const SRC = { w: 1280, h: 960 };

type Spot = { l: number; t: number; w: number; h: number };
type Mark = { kind: DefectKind; level: "safety" | "quality"; spot: Spot; pin: { l: number; t: number } };

const MARKS: Mark[] = [
  { kind: "undercooked", level: "safety", spot: { l: 21, t: 17, w: 33, h: 32 }, pin: { l: 66, t: 9 } },
  { kind: "foreign", level: "safety", spot: { l: 82, t: 61, w: 8, h: 11 }, pin: { l: 70, t: 84 } },
  { kind: "missing", level: "quality", spot: { l: 5, t: 51, w: 27, h: 42 }, pin: { l: 11, t: 16 } },
];

/** The point on the spot's ellipse that faces the pin, so the leader never crosses the food. */
function leader(mark: Mark) {
  const s = mark.spot;
  const cx = (s.l + s.w / 2) * FRAME.w / 100;
  const cy = (s.t + s.h / 2) * FRAME.h / 100;
  const rx = s.w * FRAME.w / 200;
  const ry = s.h * FRAME.h / 200;
  const px = mark.pin.l * FRAME.w / 100;
  const py = mark.pin.t * FRAME.h / 100;
  const dx = px - cx;
  const dy = py - cy;
  const k = 1 / Math.hypot(dx / rx, dy / ry);
  return { x1: cx + dx * k, y1: cy + dy * k, x2: px, y2: py };
}

export default function PitchPhoto() {
  return <figure className="relative overflow-hidden rounded-2xl bg-[#d8d4cc] shadow-[0_12px_32px_rgba(0,0,0,.25)]" style={{ aspectRatio: `${FRAME.w} / ${FRAME.h}` }}>
    {/* eslint-disable-next-line @next/next/no-img-element -- The photo is cropped with CSS, so the optimizer cannot size it. */}
    <img src={PHOTO} alt="A packing photo with three spots ringed: the chicken, beside the tofu, and the greens" className="absolute max-w-none" style={{ width: `${SRC.w / FRAME.w * 100}%`, left: `${-FRAME.x / FRAME.w * 100}%`, top: `${-FRAME.y / FRAME.h * 100}%` }} />
    <svg viewBox={`0 0 ${FRAME.w} ${FRAME.h}`} className="absolute inset-0 size-full" aria-hidden="true">
      {MARKS.map(mark => {
        const colour = mark.level === "safety" ? "var(--color-safety)" : "#e0a800";
        const s = mark.spot;
        const line = leader(mark);
        return <g key={mark.kind}>
          <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="#fff" strokeWidth={5} />
          <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={colour} strokeWidth={2} />
          <ellipse cx={(s.l + s.w / 2) * FRAME.w / 100} cy={(s.t + s.h / 2) * FRAME.h / 100} rx={s.w * FRAME.w / 200} ry={s.h * FRAME.h / 200} fill="none" stroke="#fff" strokeWidth={6} />
          <ellipse cx={(s.l + s.w / 2) * FRAME.w / 100} cy={(s.t + s.h / 2) * FRAME.h / 100} rx={s.w * FRAME.w / 200} ry={s.h * FRAME.h / 200} fill="none" stroke={colour} strokeWidth={3} />
        </g>;
      })}
    </svg>
    {MARKS.map(mark => <span key={mark.kind} className="absolute grid size-8 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 border-white shadow-[0_2px_6px_rgba(0,0,0,.3)]" style={{ left: `${mark.pin.l}%`, top: `${mark.pin.t}%`, background: mark.level === "safety" ? "var(--color-safety)" : "var(--color-quality)", color: mark.level === "safety" ? "#fff" : "var(--color-quality-ink)" }}>
      <DefectIcon kind={mark.kind} size={17} />
    </span>)}
    <figcaption className="absolute right-2 bottom-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">Public photo · synthetic findings</figcaption>
  </figure>;
}
