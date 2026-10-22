"use client";
import { useEffect, useState } from "react";

const STAGES = [
  { name: "Orkestrator", detail: "Menyiapkan foto dan daftar menu", startsAt: 0 },
  { name: "Vision", detail: "Mencari kemungkinan masalah pada foto", startsAt: 2 },
  { name: "Kepatuhan", detail: "Mencocokkan temuan dengan aturan", startsAt: 9 },
];

export default function InspectionSteps() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STAGES.findLastIndex(stage => seconds >= stage.startsAt);

  return <div className="rounded-xl border border-rule bg-mint p-4">
    <p role="status" className="sr-only">Inspeksi berlangsung. Perkiraan tahap: {STAGES[current].name}.</p>
    <p aria-hidden="true" className="font-bold">Inspeksi berlangsung <span className="font-normal text-ink2">· {seconds} dtk</span></p>
    <ol className="mt-3 flex flex-col gap-3">
      {STAGES.map((stage, index) => <li key={stage.name} className={`flex gap-3 ${index > current ? "text-ink2" : ""}`} aria-current={index === current ? "step" : undefined}>
        <span className={`mt-1 size-3 shrink-0 rounded-full border-2 border-brand ${index === current ? "bg-brand motion-safe:animate-pulse" : index < current ? "bg-brand" : ""}`} aria-hidden="true" />
        <p className="text-sm"><b>{stage.name}</b>{index === current && <span className="text-ink2"> · perkiraan tahap saat ini</span>}<span className="block text-xs text-ink2">{stage.detail}</span></p>
      </li>)}
    </ol>
    <p className="mt-3 text-xs text-ink2">Tahap ini perkiraan berdasarkan waktu, bukan status langsung dari server. Rekaman aktivitas asli muncul setelah hasil tersimpan. Jangan kirim ulang.</p>
  </div>;
}
