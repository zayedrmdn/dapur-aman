import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">{children}</svg>;
}

export function CameraIcon({ size }: { size?: number }) {
  return <Icon size={size}><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Icon>;
}

export function ArrowIcon({ size = 18 }: { size?: number }) {
  return <Icon size={size}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
}

/** The four defect pictograms: the same glyph on the photo, in the legend and in the list. */
export type DefectKind = "spoilage" | "undercooked" | "foreign" | "missing";

export function DefectIcon({ kind, size = 24 }: { kind: DefectKind; size?: number }) {
  if (kind === "undercooked") return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-4.2 4.2-2.1.3-2.6 2.6a2 2 0 1 1-2.6-2.6l2.6-2.6.3-2.1 4.2-4.2A5.5 5.5 0 0 1 15.5 3z" /></svg>;
  if (kind === "foreign") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" aria-hidden="true"><path d="M5 18c3-9 6 3 9-6s4-5 5-7" /></svg>;
  if (kind === "spoilage") return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true"><path d="M4 13h16a8 8 0 0 1-16 0z" fill="currentColor" stroke="none" /><path d="M8 9c1-1.5-1-2.5 0-4M12 9c1-1.5-1-2.5 0-4M16 9c1-1.5-1-2.5 0-4" /></svg>;
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeDasharray="3 3" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="3" /></svg>;
}

export function ChartIcon({ size }: { size?: number }) {
  return <Icon size={size}><path d="M4 20h16M7 16v-5M12 16V7M17 16v-3" /></Icon>;
}

export function ClockIcon() {
  return <Icon><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
}

export function CloseIcon() {
  return <Icon size={16}><path d="M6 6l12 12M18 6 6 18" /></Icon>;
}

export function EyeIcon() {
  return <Icon><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></Icon>;
}

export function EyeOffIcon() {
  return <Icon><path d="M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.6 3.4M6.4 6.9C3.9 8.5 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2M3.5 3.5l17 17" /></Icon>;
}

export function GalleryIcon() {
  return <Icon><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="m4 17 5-4.5 4 3.5 3-2.5 4 3.5" /></Icon>;
}

export function RefreshIcon({ size }: { size?: number }) {
  return <Icon size={size}><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></Icon>;
}

export function LogoutIcon({ size }: { size?: number }) {
  return <Icon size={size}><path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9" /></Icon>;
}
