"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@mui/material/Button";
import { api, ApiError, time, type Batch, type Overview } from "@/lib/contracts";
import StaffShell, { ErrorMessage, inputClass } from "./StaffShell";
import UploadForm from "./UploadForm";
import BatchResult from "./BatchResult";
import { backendLabel, batchHeading } from "@/lib/labels";
import { matchingRows, newestFirst, visibleRows } from "@/lib/batch-list";

const RECENT_BATCHES = 3;

export default function StaffApp({ review = false }: { review?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const batchId = search.get("batch") ?? "";
  const [user, setUser] = useState<{ name: string; role: string } | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [batch, setBatch] = useState<Batch | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const load = useCallback(async () => {
    try {
      const session = await api<{ user: { name: string; role: string } }>("session");
      setUser(session.user);
      if (review && batchId) {
        const saved = await api<Batch>(`batches/${encodeURIComponent(batchId)}`);
        setBatch(saved);
      } else setOverview(await api<Overview>("overview"));
      setError("");
    } catch (error) { if (error instanceof ApiError && error.status === 401) router.replace("/login"); else setError(error instanceof Error ? error.message : "Data belum dapat dimuat."); }
  }, [review, batchId, router]);
  useEffect(() => { let active = true; Promise.resolve().then(() => { if (active) void load(); }); return () => { active = false; }; }, [load]);
  async function logout() {
    try { await api("logout", {}); router.replace("/login"); }
    catch (error) { setError(error instanceof Error ? error.message : "Belum dapat keluar."); }
  }
  function uploaded(id: string) {
    setNotice("Permintaan diproses. Berikut hasil yang tersimpan; periksa status inspeksinya.");
    if (review && id === batchId) void load();
    else router.push(`/staff-review?batch=${encodeURIComponent(id)}`);
  }
  const rows = overview ? newestFirst(overview.packing_photos) : [];
  const matched = matchingRows(rows, query);
  const shown = visibleRows(matched, query, showAll, RECENT_BATCHES);
  return <StaffShell title={review ? "Periksa foto. Catat tindakan." : "Pilih batch atau mulai foto baru"} name={user?.name} role={user?.role} logout={user ? logout : undefined}>
    {error && <div className="p-4"><ErrorMessage>{error}</ErrorMessage><Button onClick={() => { void load(); }}>Coba muat ulang</Button></div>}
    {notice && <p role="status" className="px-4 pt-4 text-sm">{notice}</p>}
    {!user && !error && <p role="status" className="p-4">Memeriksa sesi...</p>}
    {user && !review && <>
      <section className="p-4"><h2 className="text-lg font-extrabold">Batch tersimpan</h2><p className="mt-1 text-sm text-ink2">Pilih batch untuk meninjau foto, mencatat tindakan, atau mengambil foto ulang.</p>
        {!overview ? <p role="status" className="mt-4">Memuat batch...</p> : !rows.length ? <p className="mt-4 text-sm">Belum ada batch. Foto pertama akan membuat batch baru.</p> : <>
          <label className="mt-3 block text-sm font-medium">Cari batch
            <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Nama meja atau sekolah" className={`mt-1 ${inputClass}`} />
          </label>
          {shown.length ? <ul className="mt-3 divide-y divide-rule">{shown.map(item => <li key={item.batch_id}><Link className="block py-4 hover:bg-mint" href={`/staff-review?batch=${encodeURIComponent(item.batch_id)}`}><b className="block">{batchHeading(item.table_name, item.school_name)}</b>{item.batch_status === "on_hold" && <span className="mt-2 block break-words rounded-xl border border-safety bg-safety-bg p-3 text-sm font-bold text-safety-ink">Ditahan supervisor — jangan distribusikan. {item.hold_reason || "Buka detail untuk melihat alasan."}</span>}<span className="mt-1 block text-sm text-ink2">{backendLabel(item.summary_label)}</span>{item.created_at && <span className="mt-1 block text-xs text-ink2">Dibuat {time(item.created_at)}</span>}</Link></li>)}</ul> : <p className="mt-4 text-sm">Tidak ada batch yang cocok dengan &quot;{query.trim()}&quot;.</p>}
          {rows.length > RECENT_BATCHES && <Button onClick={() => { setShowAll(value => !value); }} variant="outlined" className="mt-4">{showAll ? `Tampilkan ${RECENT_BATCHES} terbaru saja` : `Tampilkan semua (${matched.length} batch)`}</Button>}
        </>}
        <Button onClick={() => { void load(); }} variant="outlined" className="mt-4">Muat ulang daftar batch</Button>
      </section>
      <UploadForm done={uploaded} />
    </>}
    {user && review && (!batchId ? <div className="p-4"><p>Pilih batch terlebih dahulu.</p><Button component={Link} href="/staff">Lihat daftar batch</Button></div> : !batch || batch.batch_id !== batchId ? <p role="status" className="p-4">Memuat hasil tersimpan...</p> : <>
      <BatchResult key={`${batch.batch_id}:${batch.runs.length}`} batch={batch} refresh={load} isSupervisor={user.role === "supervisor"} />
      {batch.status !== "closed" && <UploadForm key={batchId} batchId={batchId} menu={batch.menu_name} table={batch.table_name} retake done={uploaded} />}
    </>)}
  </StaffShell>;
}
