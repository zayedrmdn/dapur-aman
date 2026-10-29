"use client";

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { api, ApiError, time, type SupervisorDashboardData, type BatchListItem } from "@/lib/contracts";
import { backendLabel, batchHeading, concernLabel, findingSubtitle } from "@/lib/labels";
import { TechnicalDetails } from "../components/StaffShell";
import { CameraIcon, LogoutIcon, RefreshIcon } from "../components/icons";

const headerAction = "inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-lg px-2.5 text-white transition hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-white";

function loadErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.status === 403) return "Dasbor ini hanya untuk supervisor. Masuk dengan akun supervisor untuk melihatnya.";
  if (err instanceof ApiError && err.status === 401) return "Sesi berakhir. Masuk kembali untuk membuka dasbor.";
  return err instanceof Error ? err.message : "Gagal memuat dasbor supervisor.";
}

export default function SupervisorDashboardPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [data, setData] = useState<SupervisorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string>("");
  const [userName, setUserName] = useState<string>("");
  const [filterTab, setFilterTab] = useState<"all" | "open" | "on_hold" | "closed">("all");
  const [actionNotice, setActionNotice] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activePhotoErr, setActivePhotoErr] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [holdTarget, setHoldTarget] = useState<{ batchId: string; isHold: boolean; placement: "active" | "list" } | null>(null);
  const [holdReason, setHoldReason] = useState<string>("");
  const [holdFeedback, setHoldFeedback] = useState<{ batchId: string; text: string; error: boolean } | null>(null);
  const refreshVersion = useRef(0);
  const actionPending = useRef(false);

  const loadDashboard = useCallback(async () => {
    if (actionPending.current) return;
    const version = ++refreshVersion.current;
    try {
      const [sess, res] = await Promise.all([
        api<{ user: { name: string; role: string } }>("session"),
        api<SupervisorDashboardData>("supervisor/dashboard"),
      ]);
      if (version !== refreshVersion.current || actionPending.current) return;
      if (sess?.user) {
        setUserRole(sess.user.role);
        setUserName(sess.user.name);
      }
      setData(res);
      setLastUpdated(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Jakarta" }));
      setError("");
    } catch (err) {
      if (version === refreshVersion.current) setError(loadErrorMessage(err));
    } finally {
      if (version === refreshVersion.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const currentRefresh = refreshVersion;
    const timeout = setTimeout(() => { void loadDashboard(); }, 0);
    return () => { clearTimeout(timeout); ++currentRefresh.current; };
  }, [loadDashboard]);

  // Auto-refresh interval (every 20s if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadDashboard();
    }, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadDashboard]);

  async function handleLogout() {
    try {
      await api("logout", {});
    } catch {
      // ignore
    } finally {
      startTransition(() => router.push("/login"));
    }
  }

  function openHoldForm(batchId: string, isHold: boolean, placement: "active" | "list" = "active") {
    if (actionPending.current) return;
    setHoldTarget({ batchId, isHold, placement });
    setHoldReason("");
    setActionNotice("");
    setHoldFeedback(null);
  }

  async function handleHoldBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!holdTarget || actionPending.current) return;
    const reason = holdReason.trim();
    if (reason.length < 3) return;
    const { batchId, isHold } = holdTarget;
    actionPending.current = true;
    ++refreshVersion.current;
    setActionLoading(true);
    setHoldFeedback(null);
    try {
      const result = await api<{ success: boolean; batch_status: string; hold_reason: string | null; has_open_findings: boolean }>("actions", {
        batch_id: batchId,
        action: isHold ? "on_hold" : "lift_hold",
        reason,
      });
      if (!result.success || result.batch_status !== (isHold ? "on_hold" : "in_review")) {
        throw new Error("Status penahanan belum terkonfirmasi. Muat ulang batch sebelum mencoba lagi.");
      }
      setData(previous => previous ? { ...previous, batches: previous.batches.map(batch => batch.batch_id === batchId ? {
        ...batch,
        status: isHold ? "on_hold" : result.has_open_findings ? "finding_open" : "packing",
        hold_reason: result.hold_reason,
        badge_label: isHold ? "On hold" : "Penahanan dilepaskan",
        badge_color: isHold || result.has_open_findings ? "red" : "yellow",
      } : batch) } : previous);
      setHoldFeedback({ batchId, text: isHold ? "Batch ditahan. Jangan distribusikan sebelum penahanan dilepaskan supervisor." : "Penahanan batch dilepaskan oleh supervisor.", error: false });
      setHoldTarget(null);
      setHoldReason("");
      actionPending.current = false;
      await loadDashboard();
    } catch (err) {
      setHoldFeedback({ batchId, text: err instanceof Error ? err.message : "Gagal memperbarui status penahanan batch.", error: true });
    } finally {
      actionPending.current = false;
      setActionLoading(false);
    }
  }

  function holdForm(batchId: string, isHold: boolean, placement: "active" | "list" = "active") {
    if (holdTarget?.batchId !== batchId || holdTarget.isHold !== isHold || holdTarget.placement !== placement) return null;
    const valid = holdReason.trim().length >= 3;
    return (
      <form onSubmit={handleHoldBatch} className="mt-3 flex w-full flex-col gap-2" aria-busy={actionLoading}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          {holdTarget.isHold ? `Alasan menahan ${batchName(batchId)}` : `Alasan mencabut penahanan ${batchName(batchId)}`}
          <textarea
            required
            minLength={3}
            maxLength={2000}
            rows={2}
            value={holdReason}
            onChange={(e) => setHoldReason(e.target.value)}
            disabled={actionLoading}
            className="min-h-12 w-full rounded-xl border border-rule bg-paper px-3 py-2 text-sm font-normal text-ink"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="small" variant="contained" color={holdTarget.isHold ? "error" : "primary"} disabled={actionLoading || !valid}>
            {actionLoading ? "Memproses..." : holdTarget.isHold ? "Tahan batch" : "Lepaskan tahanan"}
          </Button>
          <Button type="button" size="small" variant="text" disabled={actionLoading} onClick={() => setHoldTarget(null)}>
            Batal
          </Button>
        </div>
      </form>
    );
  }

  function holdMessage(batchId: string) {
    if (holdFeedback?.batchId !== batchId) return null;
    return <p role={holdFeedback.error ? "alert" : "status"} className={`mt-3 break-words rounded-xl border p-3 text-sm font-semibold ${holdFeedback.error ? "border-safety bg-safety-bg text-safety-ink" : "border-brand bg-mint text-brand-dark"}`}>{holdFeedback.text}</p>;
  }

  // Filter batches list
  const filteredBatches = (data?.batches || []).filter((b: BatchListItem) => {
    if (filterTab === "open") return b.status === "finding_open";
    if (filterTab === "on_hold") return b.status === "on_hold";
    if (filterTab === "closed") return b.status === "closed";
    return true;
  });
  const onHoldCount = data ? data.batches.filter((b) => b.status === "on_hold").length : 0;
  const closedCount = data ? data.batches.filter((b) => b.status === "closed").length : 0;
  const activeBatch = data?.batches.find(batch => batch.batch_id === data.active_concern?.batch_id);
  function batchName(batchId: string): string {
    const batch = data?.batches.find((b) => b.batch_id === batchId);
    return batch ? batchHeading(batch.table_name ?? batch.menu_name, batch.school_name) : "Batch ini";
  }

  return (
    <div className="min-h-screen bg-ground text-ink">
      <header className="sticky top-0 z-30 bg-brand text-white">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-2.5 sm:px-6">
          <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/15 text-base font-black tracking-tight">DA</span>
            <span className="min-w-0">
              <h1 className="truncate text-base leading-tight font-black tracking-tight sm:text-lg">
                Dapur Aman <span className="hidden text-xs font-normal opacity-85 sm:inline">by Nexara</span>
              </h1>
              <span className="line-clamp-2 text-xs leading-snug text-white/80">{data?.kitchen_name || "Memuat data dapur..."}</span>
            </span>
          </Link>
          {userName && (
            <span className="hidden flex-col text-right text-xs md:flex">
              <span className="font-bold">{userName}</span>
              <span className="text-sm text-white/75">{userRole === "supervisor" ? "Supervisor" : "Petugas dapur"}</span>
            </span>
          )}
          <nav aria-label="Aksi dasbor" className="flex shrink-0 items-center gap-1 text-sm font-bold">
            <Link href="/staff" aria-label="Layar staf" title="Layar staf" className={headerAction}>
              <CameraIcon size={18} /><span className="hidden sm:inline">Layar staf</span>
            </Link>
            <button type="button" onClick={() => loadDashboard()} aria-label="Segarkan data" title="Segarkan data" className={headerAction}>
              <RefreshIcon size={18} /><span className="hidden sm:inline">Segarkan</span>
            </button>
            <button type="button" onClick={handleLogout} aria-label="Keluar" title="Keluar" className={`${headerAction} bg-black/20 hover:bg-black/30`}>
              <LogoutIcon size={18} /><span className="hidden sm:inline">Keluar</span>
            </button>
          </nav>
        </div>
        <div className="border-t border-white/15 bg-brand-dark/60">
          <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-3 px-4 text-xs sm:px-6">
            <span className="flex min-w-0 items-center gap-2 py-1">
              <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${autoRefresh ? "bg-white" : "bg-white/40"}`} />
              <span className="truncate">
                <b className="hidden sm:inline">Dasbor supervisor · </b>
                {lastUpdated ? <span>Terakhir diperbarui {lastUpdated} WIB{error ? " · Pembaruan gagal" : !autoRefresh ? " · Pembaruan otomatis mati" : ""}</span> : <span>Belum ada pembaruan berhasil</span>}
                {data?.headline && <span className="hidden text-white/80 lg:inline"> · {data.headline}</span>}
              </span>
            </span>
            <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 select-none">
              <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="size-4 accent-white" />
              Otomatis <span className="text-white/75">20 dtk</span>
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 sm:px-6">
        {/* ACTION NOTICE */}
        {actionNotice && (
          <div role="status" className="flex items-center justify-between rounded-xl border border-brand bg-mint p-4 text-sm font-semibold text-brand-dark">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice("")} className="text-xs text-brand-dark underline">
              Tutup
            </button>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-safety bg-safety-bg p-4 text-sm font-semibold text-safety-ink">
            {error} {data && "Data yang ditampilkan mungkin sudah usang. Segarkan untuk mencoba lagi."}
            {!data && (
              <Link href="/staff" className="mt-2 block underline">
                Buka layar staf
              </Link>
            )}
          </div>
        )}

        {!data && loading && <p role="status" className="text-sm text-ink2">Memuat dasbor supervisor...</p>}

        {data && (
          <>
            {/* 3. ACTIVE CONCERN SPOTLIGHT */}
            {data.active_concern ? (
              <section
                aria-label="Temuan Kritis yang Memerlukan Tindakan"
                className="overflow-hidden rounded-2xl border-2 border-safety bg-paper"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-safety-bg bg-safety-bg px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 place-items-center rounded-full bg-safety text-xs font-bold text-white">
                      !
                    </span>
                    <h2 className="text-sm font-extrabold text-safety-ink sm:text-base">
                      Temuan keamanan pangan terbuka
                    </h2>
                  </div>
                  <span className="rounded-md bg-safety px-2.5 py-0.5 text-xs font-bold text-white">
                    Perlu tindakan
                  </span>
                </div>

                <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_1fr]">
                  {/* Left: Photo with bounding box */}
                  <div className="relative overflow-hidden rounded-xl border border-rule bg-black">
                    {data.active_concern.photo_url && !activePhotoErr ? (
                      <div className="relative mx-auto w-fit max-w-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={data.active_concern.photo_url}
                          alt="Foto bukti temuan baki"
                          className="block max-h-[380px] max-w-full w-auto h-auto"
                          onError={() => setActivePhotoErr(true)}
                        />
                        {data.active_concern.box && (
                          <svg
                            className="pointer-events-none absolute inset-0 h-full w-full"
                            viewBox="0 0 1000 1000"
                            preserveAspectRatio="none"
                          >
                            <rect
                              x={data.active_concern.box.x_min * 1000}
                              y={data.active_concern.box.y_min * 1000}
                              width={(data.active_concern.box.x_max - data.active_concern.box.x_min) * 1000}
                              height={(data.active_concern.box.y_max - data.active_concern.box.y_min) * 1000}
                              fill="rgba(215, 38, 30, 0.25)"
                              stroke="var(--color-safety)"
                              strokeWidth={4}
                            />
                          </svg>
                        )}
                        {data.active_concern.box && (
                          <div
                            className="absolute rounded bg-safety px-2 py-0.5 text-sm font-bold text-white"
                            style={{
                              left: `${Math.min(80, data.active_concern.box.x_min * 100)}%`,
                              top: `${Math.max(5, data.active_concern.box.y_min * 100 - 8)}%`,
                            }}
                          >
                            {concernLabel(data.active_concern.title)}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid h-[240px] place-items-center p-6 text-center text-sm text-white/70">
                        Foto bukti baki belum dapat dimuat. Buka riwayat batch untuk memeriksa.
                      </div>
                    )}
                  </div>

                  {/* Right: Details & Supervisor Actions */}
                  <div className="flex flex-col justify-between space-y-4">
                    <div>
                      <p className="text-sm font-bold text-ink">{batchName(data.active_concern.batch_id)}</p>
                      <p className="mt-0.5 text-xs text-ink2">{findingSubtitle(data.active_concern.subtitle)}</p>

                      <h3 className="mt-2 text-xl font-extrabold text-ink">
                        {concernLabel(data.active_concern.title)}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-ink2">
                        {data.active_concern.detail}
                      </p>

                      <div className="mt-4 rounded-xl border border-quality bg-quality-bg p-3 text-xs text-quality-ink">
                        <p className="font-bold">Saran langkah (asumsi demo, belum diverifikasi):</p>
                        <p className="mt-0.5">
                          1. Minta tim meja packing menahan baki ini.
                          <br />
                          2. Ganti porsi yang terdampak dengan porsi baru.
                          <br />
                          3. Ambil foto ulang sebelum tutup dipasang.
                        </p>
                      </div>
                    </div>

                    {/* Supervisor Control Actions */}
                    <div className="border-t border-rule pt-2">
                      {activeBatch?.status === "on_hold" && <div className="mb-3 rounded-xl border border-safety bg-safety-bg p-3 text-sm text-safety-ink">
                        <p className="font-bold">Batch ditahan — jangan distribusikan</p>
                        <p className="mt-1 break-words">{activeBatch.hold_reason || "Alasan penahanan belum tersedia. Buka riwayat batch."}</p>
                      </div>}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="contained"
                          color="error"
                          disabled={actionLoading || !activeBatch || activeBatch.status === "closed"}
                          onClick={() => openHoldForm(data.active_concern!.batch_id, activeBatch?.status !== "on_hold")}
                        >
                          {activeBatch?.status === "on_hold" ? "Lepaskan tahanan" : "Tahan batch"}
                        </Button>

                        <Button
                          variant="outlined"
                          color="primary"
                          component={Link}
                          href={`/staff-review?batch=${encodeURIComponent(data.active_concern.batch_id)}`}
                        >
                          Buka detail batch
                        </Button>
                      </div>
                      {holdForm(data.active_concern.batch_id, activeBatch?.status !== "on_hold")}
                      {holdMessage(data.active_concern.batch_id)}
                      <TechnicalDetails className="mt-2" items={[["ID batch", data.active_concern.batch_id], ["ID temuan", data.active_concern.finding_id]]} />
                    </div>
                  </div>
                </div>
              </section>
            ) : (
              <section className="rounded-2xl border border-rule bg-paper p-5">
                <h2 className="text-base font-extrabold text-ink">
                  Tidak ada temuan keamanan terbuka
                </h2>
                <p className="mt-0.5 text-xs text-ink2">
                  Tidak ada temuan keamanan terbuka saat ini. Hasil foto bukan jaminan keamanan pangan.
                </p>
              </section>
            )}

            {/* 2. KPI CARDS */}
            <section aria-label="Ringkasan Kinerja Dapur" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
              {/* Card 1: Total Batches */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Total batch</div>
                <div className="mt-2 text-2xl font-black text-ink sm:text-3xl">{data.batches.length}</div>
                <p className="mt-1 text-sm text-ink2">Meja packing tercatat</p>
              </div>

              {/* Card 2: Batch ditutup */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Batch ditutup</div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-brand sm:text-3xl">{closedCount}</span>
                  <span className="text-sm font-semibold text-ink2">dari {data.batches.length} batch</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-rule">
                  <div className="h-full bg-brand transition-all duration-500" style={{ width: `${data.batches.length ? data.clean_pass_rate : 0}%` }}></div>
                </div>
              </div>

              {/* Card 3: Temuan Keamanan */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Temuan keamanan</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl font-black sm:text-3xl ${data.stats.open > 0 ? "text-safety" : "text-brand"}`}>
                    {data.stats.open}
                  </span>
                  <span className="text-sm font-semibold text-ink2">Aktif</span>
                </div>
                <p className="mt-1 text-sm text-ink2">
                  {data.stats.fixed} selesai • {data.stats.dismissed} diabaikan
                </p>
              </div>

              {/* Card 4: Baki Ditahan */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Batch ditahan</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl font-black sm:text-3xl ${onHoldCount > 0 ? "text-safety" : "text-ink"}`}>{onHoldCount}</span>
                  <span className="text-sm font-semibold text-ink2">Batch</span>
                </div>
                <p className="mt-1 text-sm text-ink2">Menunggu keputusan supervisor</p>
              </div>

            </section>

            {/* 5. DUA KOLOM: SAFETY FEED & BATCH MANAGEMENT */}
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              {/* KOLOM KIRI: SAFETY FEED */}
              <section aria-label="Linimasa Temuan Keamanan" className="min-w-0 rounded-2xl border border-rule bg-paper p-5">
                <div className="flex items-center justify-between border-b border-rule pb-3">
                  <div>
                    <h2 className="font-extrabold text-ink">Linimasa temuan keamanan</h2>
                    <p className="text-xs text-ink2">Riwayat temuan keamanan dari inspeksi foto</p>
                  </div>
                  <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-bold text-brand-dark">
                    {data.safety_feed.length} catatan
                  </span>
                </div>

                <div className="mt-4 max-h-[500px] divide-y divide-rule overflow-y-auto pr-1">
                  {data.safety_feed.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink2">Belum ada riwayat temuan keamanan pangan.</p>
                  ) : (
                    data.safety_feed.map((item) => (
                      <Link key={item.finding_id} href={`/staff-review?batch=${encodeURIComponent(item.batch_id)}`} className="flex items-start gap-3 py-3 text-xs hover:bg-ground focus-visible:outline-2 focus-visible:outline-brand">
                        {/* Thumbnail */}
                        <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-rule bg-ground">
                          {item.thumbnail_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <h4 className="truncate font-extrabold text-ink">{concernLabel(item.title)}</h4>
                            <span
                              className={`rounded px-1.5 py-0.5 text-sm font-bold ${
                                item.status === "fixed"
                                  ? "bg-mint text-brand-dark"
                                  : item.status === "open"
                                  ? "bg-safety-bg text-safety-ink"
                                  : "bg-ground text-ink2"
                              }`}
                            >
                              {backendLabel(item.duration_label)}
                            </span>
                          </div>
                          <p className="text-sm text-ink2">{batchName(item.batch_id)} · {findingSubtitle(item.subtitle)}</p>
                          <span className="mt-1 block font-bold text-brand underline">Buka batch</span>
                          {item.resolution_note && (
                            <p className="mt-1 rounded bg-ground p-1.5 text-sm font-medium text-ink">
                              {item.resolution_note}
                            </p>
                          )}
                        </div>
                      </Link>
                    ))
                  )}
                </div>
              </section>

              {/* KOLOM KANAN: MANAJEMEN BATCH */}
              <section aria-label="Manajemen Batch" className="min-w-0 rounded-2xl border border-rule bg-paper p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
                  <div>
                    <h2 className="font-extrabold text-ink">Manajemen status batch</h2>
                    <p className="text-xs text-ink2">Daftar meja packing, status pemeriksaan, dan kontrol supervisor</p>
                  </div>

                  {/* Filter Tabs */}
                  <div className="grid w-full grid-cols-2 gap-1 rounded-xl bg-ground p-1 text-xs sm:flex sm:w-auto sm:flex-wrap sm:items-center">
                    {(
                      [
                        { id: "all", label: "Semua" },
                        { id: "open", label: "Perlu tindakan" },
                        { id: "on_hold", label: "Ditahan" },
                        { id: "closed", label: "Ditutup" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setFilterTab(tab.id)}
                        aria-pressed={filterTab === tab.id}
                        className={`min-h-11 rounded-lg px-2.5 py-1 font-bold transition ${
                          filterTab === tab.id ? "bg-paper text-brand-dark" : "text-ink2 hover:text-ink"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table / List */}
                <div className="mt-4 max-h-[500px] divide-y divide-rule overflow-y-auto">
                  {holdFeedback && !filteredBatches.some(batch => batch.batch_id === holdFeedback.batchId) && holdMessage(holdFeedback.batchId)}
                  {filteredBatches.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink2">Tidak ada batch untuk filter ini.</p>
                  ) : (
                    filteredBatches.map((b) => (
                      <div key={b.batch_id} className="py-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 max-w-[420px]">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="font-bold text-ink">{batchName(b.batch_id)}</span>
                              <span
                                className={`shrink-0 rounded px-1.5 py-0.5 text-sm font-bold ${
                                  b.badge_color === "green"
                                    ? "bg-mint text-brand-dark"
                                    : b.badge_color === "red"
                                    ? "bg-safety-bg text-safety-ink"
                                    : "bg-quality-bg text-quality-ink"
                                }`}
                              >
                                {backendLabel(b.badge_label)}
                              </span>
                            </div>
                            <p className="mt-0.5 text-ink">{b.menu_name}</p>
                            <p className="text-sm text-ink2">
                              {[b.created_at ? `Dibuat ${time(b.created_at)}` : "", b.subtitle.startsWith(`${b.menu_name} • `) ? b.subtitle.slice(b.menu_name.length + 3) : b.subtitle].filter(Boolean).join(" • ")}
                            </p>
                          </div>

                          <div className="flex items-center gap-2">
                            {b.status === "on_hold" && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                disabled={actionLoading}
                                onClick={() => openHoldForm(b.batch_id, false, "list")}
                                className="text-sm font-bold"
                              >
                                Lepaskan tahanan
                              </Button>
                            )}


                            <Button
                              size="small"
                              variant="contained"
                              component={Link}
                              href={`/staff-review?batch=${encodeURIComponent(b.batch_id)}`}
                              className="text-sm font-bold"
                            >
                              Buka detail
                            </Button>
                          </div>
                        </div>
                        {b.status === "on_hold" && holdForm(b.batch_id, false, "list")}
                        {b.status === "on_hold" && <p className="mt-2 break-words font-semibold text-safety-ink">Ditahan: {b.hold_reason || "Buka riwayat batch untuk melihat alasan."}</p>}
                        {holdMessage(b.batch_id)}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* 4. SEKOLAH SASARAN MBG */}
            <section aria-label="Monitoring Sekolah Sasaran MBG" className="space-y-3">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">Sekolah sasaran distribusi MBG</h2>
                <p className="text-xs text-ink2">Target alokasi dan jumlah batch per sekolah; bukan jumlah porsi yang siap dikirim.</p>
              </div>

              {data.schools.length === 0 ? (
                <p className="rounded-2xl border border-rule bg-paper p-4 text-sm text-ink2">Belum ada sekolah tujuan yang terdaftar.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.schools.map((sch) => {
                    const isReady = sch.cleared_batches > 0 && sch.in_progress_batches === 0;
                    const isWorking = sch.in_progress_batches > 0;

                    return (
                      <div key={sch.id} className="flex flex-col justify-between rounded-2xl border border-rule bg-paper p-4">
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <h3 className="font-extrabold text-ink">{sch.name}</h3>
                              <p className="mt-0.5 text-xs text-ink2">
                                Kepsek: <b>{sch.principal_name}</b>
                              </p>
                              <p className="text-xs text-ink2">Telepon: {sch.phone_number}</p>
                            </div>
                            <Chip
                              size="small"
                              label={isReady ? "Batch ditutup" : isWorking ? "Packing" : "Menunggu"}
                              color={isReady ? "success" : isWorking ? "warning" : "default"}
                              className="text-sm font-bold"
                            />
                          </div>

                          <div className="mt-4 rounded-xl bg-ground p-3 text-xs">
                            <div className="flex justify-between font-semibold text-ink">
                              <span>Alokasi porsi:</span>
                              <span className="font-bold text-brand-dark">{sch.target_portions} baki siswa</span>
                            </div>
                            <div className="mt-1 flex justify-between text-ink2">
                              <span>Batch ditutup:</span>
                              <span className="font-bold">{sch.cleared_batches} batch</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-rule pt-3">
                          <span className="block truncate text-sm text-ink2">{sch.address}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-rule bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="font-bold text-ink2">
                  <span>Foto hanya membantu melihat kemungkinan masalah; hasil foto bukan jaminan keamanan pangan.</span>
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
