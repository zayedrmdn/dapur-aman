"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import { api, ApiError, type Batch } from "@/lib/contracts";
import { batchHeading, formatWib, runErrorLabel } from "@/lib/labels";
import { PENDING_EVENT, clearPendingInspection, isStale, readPendingInspection, type PendingInspection } from "@/lib/pending-inspection";

type Status =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "running" }
  | { kind: "stale" }
  | { kind: "done"; batch: Batch }
  | { kind: "failed"; batch: Batch }
  | { kind: "error"; message: string };

const POLL_MS = 10_000;

function latestRun(batch: Batch) {
  return [...batch.runs].sort((left, right) => right.created_at.localeCompare(left.created_at))[0];
}

/** The inspection this device started, and where it stands now. */
export default function InspectionStatus() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingInspection | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const opened = useRef(false);

  const check = useCallback(async () => {
    const current = readPendingInspection();
    setPending(current);
    if (!current) { setStatus({ kind: "idle" }); return; }
    try {
      const batch = await api<Batch>(`batches/${encodeURIComponent(current.batchId)}`);
      const run = latestRun(batch);
      if (!run) { setStatus({ kind: "running" }); return; }
      clearPendingInspection();
      setStatus(run.state === "completed" ? { kind: "done", batch } : { kind: "failed", batch });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        setStatus(isStale(current) ? { kind: "stale" } : { kind: "running" });
        return;
      }
      setStatus({ kind: "error", message: error instanceof Error ? error.message : "Status inspeksi belum dapat diperiksa." });
    }
  }, []);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => { if (active) void check(); });
    function onVisible() { if (document.visibilityState === "visible") void check(); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    window.addEventListener(PENDING_EVENT, check);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      window.removeEventListener(PENDING_EVENT, check);
    };
  }, [check]);

  useEffect(() => {
    if (status.kind !== "running" && status.kind !== "checking") return;
    const timer = setInterval(() => { void check(); }, POLL_MS);
    return () => clearInterval(timer);
  }, [status.kind, check]);

  useEffect(() => {
    if (status.kind !== "done" || opened.current) return;
    opened.current = true;
    router.push(`/staff-review?batch=${encodeURIComponent(status.batch.batch_id)}`);
  }, [status, router]);

  function openBatch(batch: Batch) {
    router.push(`/staff-review?batch=${encodeURIComponent(batch.batch_id)}`);
  }

  if (status.kind === "idle") return null;

  if (status.kind === "checking") return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p role="status" className="text-sm text-ink2">Memeriksa status inspeksi...</p>
  </section>;

  if (status.kind === "running") return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p className="font-bold">Inspeksi Anda masih berjalan di server</p>
    <p className="mt-1 text-sm text-ink2">Mulai {pending ? formatWib(new Date(pending.startedAt)) : ""}. Hasilnya disimpan otomatis setelah selesai; tahap yang ditampilkan bukan status langsung dari server.</p>
    <Button variant="outlined" className="mt-3" onClick={() => { void check(); }}>Periksa status lagi</Button>
  </section>;

  if (status.kind === "stale") return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p className="font-bold">Inspeksi ini berhenti tanpa menyimpan hasil</p>
    <p className="mt-1 text-sm text-ink2">Mulai {pending ? formatWib(new Date(pending.startedAt)) : ""}. Sudah lewat batas waktu dan tidak ada batch yang tersimpan, jadi tidak ada batch ganda. Periksa lagi atau mulai batch baru.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <Button variant="outlined" onClick={() => { void check(); }}>Periksa status lagi</Button>
      <Button variant="contained" onClick={() => { clearPendingInspection(); }}>Mulai batch baru</Button>
    </div>
  </section>;

  if (status.kind === "error") return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p className="font-bold">Status inspeksi belum dapat diperiksa</p>
    <p className="mt-1 text-sm text-ink2">{status.message}</p>
    <Button variant="outlined" className="mt-3" onClick={() => { void check(); }}>Coba lagi</Button>
  </section>;

  const run = latestRun(status.batch);
  if (status.kind === "failed") return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p className="font-bold">Inspeksi gagal, hasilnya tetap tersimpan</p>
    <p className="mt-1 text-sm text-ink2">{batchHeading(status.batch.table_name, status.batch.school_name)} - {run ? runErrorLabel(run.error) : "Inspeksi tidak selesai."}</p>
    <Button variant="contained" className="mt-3" onClick={() => { openBatch(status.batch); }}>Lihat hasil tersimpan</Button>
    <p className="mt-2 text-xs text-ink2">Di halaman hasil Anda dapat mengambil foto ulang ke batch yang sama, tanpa membuat batch baru.</p>
  </section>;

  return <section id="dapur-inspection-status" className="border-b border-rule p-4">
    <p className="font-bold">Hasil inspeksi tersimpan</p>
    <p className="mt-1 text-sm text-ink2">{batchHeading(status.batch.table_name, status.batch.school_name)}</p>
    <Button variant="contained" className="mt-3" onClick={() => { openBatch(status.batch); }}>Lihat hasil inspeksi</Button>
  </section>;
}
