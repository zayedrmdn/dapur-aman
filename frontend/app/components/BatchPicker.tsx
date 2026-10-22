"use client";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { time } from "@/lib/contracts";
import { backendLabel, batchHeading } from "@/lib/labels";
import { matchingRows, pickerRows, type BatchRow } from "@/lib/batch-list";
import { inputClass } from "./StaffShell";

const RECENT_BATCHES = 3;
const SEARCH_LIMIT = 8;

/** Compact dropdown: the newest batches by default, a search field to reach any older one. */
export default function BatchPicker({ rows }: { rows: BatchRow[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const matched = matchingRows(rows, query);
  const options = pickerRows(matched, query, RECENT_BATCHES, SEARCH_LIMIT);
  const searching = query.trim() !== "";
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return <div ref={root} className="relative mt-3" onKeyDown={event => { if (event.key === "Escape") setOpen(false); }}>
    <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => { setOpen(value => !value); }} className={`${inputClass} flex items-center justify-between gap-3 text-left font-medium`}>
      <span>Pilih batch <span className="font-normal text-ink2">({rows.length} tersimpan)</span></span>
      <span aria-hidden="true" className={`transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
    </button>
    {open && <div id={panelId} className="absolute inset-x-0 z-10 mt-2 rounded-xl border border-rule bg-paper p-3 shadow-[0_8px_24px_rgba(0,0,0,.12)]">
      <label className="block text-sm font-medium">Cari batch lama
        <input type="search" autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama meja atau sekolah" className={`mt-1 ${inputClass}`} />
      </label>
      <p className="mt-3 text-xs font-bold text-ink2">{searching ? `${matched.length} batch cocok` : `${Math.min(RECENT_BATCHES, rows.length)} batch terbaru`}</p>
      {options.length ? <ul className="mt-1 max-h-80 divide-y divide-rule overflow-y-auto">{options.map(item => <li key={item.batch_id}>
        <Link className="block rounded-lg px-2 py-3 hover:bg-mint focus-visible:bg-mint" href={`/staff-review?batch=${encodeURIComponent(item.batch_id)}`}>
          <b className="block">{batchHeading(item.table_name, item.school_name)}</b>
          <span className="mt-0.5 block text-sm text-ink2">{item.created_at ? `${time(item.created_at)} · ` : ""}{item.batch_status === "on_hold" ? <span className="font-bold text-safety-ink">Ditahan supervisor</span> : backendLabel(item.summary_label)}</span>
        </Link>
      </li>)}</ul> : <p className="mt-2 text-sm">Tidak ada batch yang cocok dengan &quot;{query.trim()}&quot;.</p>}
      {searching && matched.length > options.length && <p className="mt-2 text-xs text-ink2">{matched.length - options.length} lainnya. Perjelas pencarian untuk melihatnya.</p>}
    </div>}
  </div>;
}
