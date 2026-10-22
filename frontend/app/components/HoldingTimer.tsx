"use client";
import { useEffect, useState } from "react";
import { parseUtc, time, type Batch } from "@/lib/contracts";
import { ClockIcon } from "./icons";

const LIMIT_MINUTES = 4 * 60;
const WARNING_MINUTES = 30;

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} j ${String(rest).padStart(2, "0")} m` : `${rest} m`;
}

function closedAt(batch: Batch) {
  const closes = batch.actions.filter(action => action.action === "close");
  return closes.length ? closes[closes.length - 1].created_at : null;
}

export default function HoldingTimer({ batch }: { batch: Batch }) {
  const [now, setNow] = useState(() => Date.now());
  const closed = batch.status === "closed";
  useEffect(() => {
    if (closed) return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [closed]);

  const closeTime = closed ? closedAt(batch) : null;
  const end = closeTime ? parseUtc(closeTime).getTime() : now;
  const elapsed = Math.max(0, Math.floor((end - parseUtc(batch.created_at).getTime()) / 60_000));
  const remaining = LIMIT_MINUTES - elapsed;
  const tone = closed ? "border-rule" : remaining <= 0 ? "border-safety bg-safety-bg text-safety-ink" : remaining <= WARNING_MINUTES ? "border-quality bg-quality-bg text-quality-ink" : "border-rule";

  return <div className={`rounded-xl border p-3 text-sm ${tone}`}>
    <p className="flex items-center gap-2 font-bold"><ClockIcon />Waktu sejak foto pertama: {closed && !closeTime ? "tidak tercatat" : duration(elapsed)}</p>
    {closed
      ? <p className="mt-1">{closeTime ? `Penghitung berhenti saat batch ditutup (${time(closeTime)}).` : "Batch ditutup; waktu penutupan tidak tercatat."}</p>
      : remaining > 0
        ? <p className="mt-1">Sisa menuju batas 4 jam: <b>{duration(remaining)}</b></p>
        : <p className="mt-1 font-bold">Melewati batas asumsi 4 jam. Konsultasikan dengan supervisor sebelum makanan dibagikan.</p>}
    <p className={`mt-2 text-xs ${tone === "border-rule" ? "text-ink2" : ""}`}>Batas 4 jam adalah asumsi demo yang belum diverifikasi. Dihitung dari foto pertama, bukan dari selesai masak, jadi waktu sejak selesai masak bisa lebih lama.</p>
  </div>;
}
