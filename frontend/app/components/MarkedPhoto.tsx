"use client";
/* eslint-disable @next/next/no-img-element -- Private signed URLs must load directly without image optimization. */
import { useState } from "react";
import type { Finding } from "@/lib/contracts";

export default function MarkedPhoto({ url, findings, refresh }: { url: string | null; findings: Finding[]; refresh: () => void }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url || failedUrl === url) return <div className="border-y border-rule p-4"><p className="text-sm">Foto belum tersedia atau tautannya berakhir.</p><button onClick={() => { setFailedUrl(null); refresh(); }} className="mt-2 font-bold text-brand underline">Muat ulang tautan foto</button></div>;
  return <figure>
    <div className="relative">
      <img src={url} referrerPolicy="no-referrer" alt="Foto packing untuk inspeksi yang dipilih" className="block h-auto w-full" onError={() => setFailedUrl(url)} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {findings.filter(f => f.box).map(f => <rect key={f.id} x={f.box!.x_min * 1000} y={f.box!.y_min * 1000} width={(f.box!.x_max - f.box!.x_min) * 1000} height={(f.box!.y_max - f.box!.y_min) * 1000} fill="none" stroke={f.level === "safety" ? "var(--color-safety)" : "var(--color-quality-ink)"} strokeWidth={3} vectorEffect="non-scaling-stroke" />)}
      </svg>
      {findings.map((f, index) => f.box && <a key={f.id} href={`#finding-${f.id}`} aria-label={`Lihat temuan ${index + 1}: ${f.title}`} className={`absolute grid size-8 place-items-center rounded-full border-2 border-white text-sm font-bold ${f.level === "safety" ? "bg-safety text-white" : "bg-quality text-quality-ink"}`} style={{ left: `${Math.min(90, f.box.x_min * 100)}%`, top: `${Math.min(90, f.box.y_min * 100)}%` }}>{index + 1}</a>)}
    </div>
    <figcaption className="px-4 py-2 text-xs text-ink2">Penanda menunjukkan kemungkinan masalah pada foto ini, bukan keputusan keamanan pangan.</figcaption>
  </figure>;
}
