import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">{children}</svg>;
}

export function CameraIcon() {
  return <Icon><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Icon>;
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
