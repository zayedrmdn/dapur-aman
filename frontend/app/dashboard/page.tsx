"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { api, ApiError, type SupervisorDashboardData, type BatchListItem } from "@/lib/contracts";
import { backendLabel, concernLabel, findingSubtitle } from "@/lib/labels";

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
  const [currentTime, setCurrentTime] = useState<string>("");
  const [holdTarget, setHoldTarget] = useState<{ batchId: string; isHold: boolean } | null>(null);
  const [holdReason, setHoldReason] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" }));
    };
    const timeout = setTimeout(updateTime, 0);
    const timer = setInterval(updateTime, 15000);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, []);

  async function loadDashboard() {
    try {
      const sess = await api<{ user: { name: string; role: string } }>("session");
      if (sess?.user) {
        setUserRole(sess.user.role);
        setUserName(sess.user.name);
      }
      const res = await api<SupervisorDashboardData>("supervisor/dashboard");
      setData(res);
      setError("");
    } catch (err) {
      setError(loadErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ user: { name: string; role: string } }>("session").catch(() => null),
      api<SupervisorDashboardData>("supervisor/dashboard").catch((err) => {
        if (active) setError(loadErrorMessage(err));
        return null;
      }),
    ]).then(([sess, res]) => {
      if (!active) return;
      if (sess?.user) {
        setUserRole(sess.user.role);
        setUserName(sess.user.name);
      }
      if (res) {
        setData(res);
        setError("");
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  // Auto-refresh interval (every 20s if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      void loadDashboard();
    }, 20000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  async function handleLogout() {
    try {
      await api("logout", {});
    } catch {
      // ignore
    } finally {
      startTransition(() => router.push("/login"));
    }
  }

  function openHoldForm(batchId: string, isHold: boolean) {
    setHoldTarget({ batchId, isHold });
    setHoldReason("");
    setActionNotice("");
  }

  async function handleHoldBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!holdTarget) return;
    const reason = holdReason.trim();
    if (reason.length < 3) return;
    const { batchId, isHold } = holdTarget;
    setActionLoading(true);
    setActionNotice("");
    try {
      await api("actions", {
        batch_id: batchId,
        action: isHold ? "on_hold" : "lift_hold",
        reason,
      });

      setActionNotice(isHold ? `Batch ${batchId} ditahan.` : `Penahanan batch ${batchId} dicabut.`);
      setHoldTarget(null);
      setHoldReason("");
      await loadDashboard();
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "Gagal memperbarui status penahanan batch.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSendTelegram(batchId: string) {
    setActionLoading(true);
    setActionNotice("");
    try {
      await api(`notifications/dispatch-report/${encodeURIComponent(batchId)}`, {});
      setActionNotice(`Laporan untuk ${batchId} terkirim ke Telegram sekolah.`);
      await loadDashboard();
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "Gagal mengirim notifikasi Telegram.");
    } finally {
      setActionLoading(false);
    }
  }

  function holdForm(batchId: string, isHold: boolean) {
    if (holdTarget?.batchId !== batchId || holdTarget.isHold !== isHold) return null;
    const valid = holdReason.trim().length >= 3;
    return (
      <form onSubmit={handleHoldBatch} className="mt-3 flex w-full flex-col gap-2" aria-busy={actionLoading}>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink">
          {holdTarget.isHold ? `Alasan menahan batch ${batchId}` : `Alasan mencabut penahanan ${batchId}`}
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
            {actionLoading ? "Memproses..." : holdTarget.isHold ? "Tahan batch" : "Cabut penahanan"}
          </Button>
          <Button type="button" size="small" variant="text" disabled={actionLoading} onClick={() => setHoldTarget(null)}>
            Batal
          </Button>
        </div>
      </form>
    );
  }

  // Filter batches list
  const filteredBatches = (data?.batches || []).filter((b: BatchListItem) => {
    if (filterTab === "open") return b.status === "finding_open";
    if (filterTab === "on_hold") return b.status === "on_hold";
    if (filterTab === "closed") return b.status === "closed";
    return true;
  });
  const onHoldCount = data ? data.batches.filter((b) => b.status === "on_hold").length : 0;

  return (
    <div className="min-h-screen bg-ground text-ink">
      {/* 1. TOP HEADER */}
      <header className="sticky top-0 z-30 border-b border-brand-dark bg-brand text-white">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 text-xl font-black tracking-tight text-white">
              DA
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight sm:text-xl">
                Dapur Aman <span className="text-xs font-normal opacity-85">by Nexara</span>
              </h1>
              <p className="text-xs text-white/80">
                {data?.kitchen_name || "Memuat data dapur..."} • Dasbor supervisor
              </p>
            </div>
          </div>

          {/* Quick Nav & Actor */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
            {userName && (
              <div className="hidden flex-col text-right md:flex">
                <span className="font-bold text-white">{userName}</span>
                <span className="text-[11px] text-white/75">
                  {userRole === "supervisor" ? "Supervisor" : "Petugas dapur"}
                </span>
              </div>
            )}

            <Link
              href="/staff"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-bold text-white transition hover:bg-white/20"
            >
              Meja packing (staf)
            </Link>

            <button
              onClick={() => loadDashboard()}
              title="Segarkan data terbaru"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-bold text-white transition hover:bg-white/20"
            >
              Segarkan
            </button>

            <button
              onClick={handleLogout}
              className="rounded-lg bg-black/20 px-3 py-1.5 font-bold text-white transition hover:bg-black/30"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>

      {/* SUB-HEADER: STATUS & TIME */}
      <div className="border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold text-brand-dark">Pemantauan batch</span>
            {data?.headline && (
              <>
                <span className="hidden text-ink2 sm:inline">•</span>
                <span className="hidden text-ink2 sm:inline">{data.headline}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5 text-ink2 select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded accent-brand"
              />
              Segarkan otomatis (20 dtk)
            </label>
            {currentTime && (
              <span className="font-semibold text-brand-dark">
                {currentTime} WIB
              </span>
            )}
          </div>
        </div>
      </div>

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
            {error}
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
            {/* 2. KPI CARDS */}
            <section aria-label="Ringkasan Kinerja Dapur" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
              {/* Card 1: Total Batches */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Total batch</div>
                <div className="mt-2 text-2xl font-black text-ink sm:text-3xl">{data.batches.length}</div>
                <p className="mt-1 text-[11px] text-ink2">Meja packing tercatat</p>
              </div>

              {/* Card 2: Batch ditutup */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Batch ditutup</div>
                <div className="mt-2 flex items-baseline gap-1.5">
                  <span className="text-2xl font-black text-brand sm:text-3xl">{data.batches.length ? `${data.clean_pass_rate}%` : "-"}</span>
                  <span className="text-[10px] font-bold text-ink2">dari semua batch</span>
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
                  <span className="text-[11px] font-semibold text-ink2">Aktif</span>
                </div>
                <p className="mt-1 text-[11px] text-ink2">
                  {data.stats.fixed} selesai • {data.stats.dismissed} diabaikan
                </p>
              </div>

              {/* Card 4: Baki Ditahan */}
              <div className="rounded-2xl border border-rule bg-paper p-4">
                <div className="text-xs font-bold text-ink2">Batch ditahan</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className={`text-2xl font-black sm:text-3xl ${onHoldCount > 0 ? "text-safety" : "text-ink"}`}>{onHoldCount}</span>
                  <span className="text-[11px] font-semibold text-ink2">Batch</span>
                </div>
                <p className="mt-1 text-[11px] text-ink2">Menunggu keputusan supervisor</p>
              </div>

              {/* Card 5: Porsi */}
              <div className="col-span-2 rounded-2xl border border-brand-dark bg-brand-dark p-4 text-white md:col-span-1">
                <div className="text-xs font-bold text-white/80">Porsi siap kirim</div>
                <div className="mt-2 text-2xl font-black sm:text-3xl">{data.total_portions_cleared}</div>
                <p className="mt-1 text-[11px] text-white/75">Dari batch yang ditutup manusia</p>
              </div>
            </section>

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
                      <div className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={data.active_concern.photo_url}
                          alt="Foto bukti temuan baki"
                          className="max-h-[380px] w-full object-contain"
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
                            className="absolute rounded bg-safety px-2 py-0.5 text-[11px] font-bold text-white"
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-safety-bg px-2 py-0.5 text-xs font-bold text-safety-ink">
                          ID temuan: {data.active_concern.finding_id}
                        </span>
                        <span className="text-xs text-ink2">{findingSubtitle(data.active_concern.subtitle)}</span>
                      </div>

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
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          variant="contained"
                          color="error"
                          disabled={actionLoading}
                          onClick={() => openHoldForm(data.active_concern!.batch_id, true)}
                        >
                          {`Tahan batch (${data.active_concern.batch_id})`}
                        </Button>

                        <Button
                          variant="outlined"
                          color="primary"
                          component={Link}
                          href={`/staff-review?batch=${encodeURIComponent(data.active_concern.batch_id)}`}
                        >
                          Buka detail baki dan tindakan staf
                        </Button>
                      </div>
                      {holdForm(data.active_concern.batch_id, true)}
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

            {/* 4. SEKOLAH SASARAN MBG */}
            <section aria-label="Monitoring Sekolah Sasaran MBG" className="space-y-3">
              <div>
                <h2 className="text-lg font-extrabold tracking-tight">Sekolah sasaran distribusi MBG</h2>
                <p className="text-xs text-ink2">Realisasi alokasi porsi dan status kesiapan pengiriman makanan</p>
              </div>

              {data.schools.length === 0 ? (
                <p className="rounded-2xl border border-rule bg-paper p-4 text-sm text-ink2">Belum ada sekolah tujuan yang terdaftar.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.schools.map((sch) => {
                    const isReady = sch.cleared_batches > 0 && sch.in_progress_batches === 0;
                    const isWorking = sch.in_progress_batches > 0;
                    const totalClearedPortions = sch.cleared_batches * sch.target_portions;

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
                              label={isReady ? "Siap" : isWorking ? "Packing" : "Menunggu"}
                              color={isReady ? "success" : isWorking ? "warning" : "default"}
                              className="text-[10px] font-bold"
                            />
                          </div>

                          <div className="mt-4 rounded-xl bg-ground p-3 text-xs">
                            <div className="flex justify-between font-semibold text-ink">
                              <span>Alokasi porsi:</span>
                              <span className="font-bold text-brand-dark">{sch.target_portions} baki siswa</span>
                            </div>
                            <div className="mt-1 flex justify-between text-ink2">
                              <span>Batch ditutup:</span>
                              <span className="font-bold">{sch.cleared_batches} batch ({totalClearedPortions} porsi)</span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 border-t border-rule pt-3">
                          <span className="block truncate text-[11px] text-ink2">{sch.address}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* 5. DUA KOLOM: SAFETY FEED & BATCH MANAGEMENT */}
            <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
              {/* KOLOM KIRI: SAFETY FEED */}
              <section aria-label="Linimasa Temuan Keamanan" className="rounded-2xl border border-rule bg-paper p-5">
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
                      <div key={item.finding_id} className="flex items-start gap-3 py-3 text-xs">
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
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
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
                          <p className="text-[11px] text-ink2">{findingSubtitle(item.subtitle)}</p>
                          {item.resolution_note && (
                            <p className="mt-1 rounded bg-ground p-1.5 text-[11px] font-medium text-ink">
                              {item.resolution_note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>

              {/* KOLOM KANAN: MANAJEMEN BATCH */}
              <section aria-label="Manajemen Batch" className="rounded-2xl border border-rule bg-paper p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
                  <div>
                    <h2 className="font-extrabold text-ink">Manajemen status batch</h2>
                    <p className="text-xs text-ink2">Daftar meja packing, status pemeriksaan, dan kontrol supervisor</p>
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 rounded-xl bg-ground p-1 text-xs">
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
                        className={`rounded-lg px-2.5 py-1 font-bold transition ${
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
                  {filteredBatches.length === 0 ? (
                    <p className="py-8 text-center text-xs text-ink2">Tidak ada batch untuk filter ini.</p>
                  ) : (
                    filteredBatches.map((b) => (
                      <div key={b.batch_id} className="py-3 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0 max-w-[320px]">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-ink">{b.batch_id}</span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
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
                            <p className="mt-0.5 truncate font-bold text-ink">{b.menu_name}</p>
                            <p className="truncate text-[11px] text-ink2">{b.subtitle}</p>
                          </div>

                          <div className="flex items-center gap-2">
                            {b.status === "on_hold" && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="success"
                                disabled={actionLoading}
                                onClick={() => openHoldForm(b.batch_id, false)}
                                className="text-[11px] font-bold"
                              >
                                Cabut penahanan
                              </Button>
                            )}

                            {b.status === "closed" && (
                              <Button
                                size="small"
                                variant="outlined"
                                disabled={actionLoading}
                                onClick={() => handleSendTelegram(b.batch_id)}
                                className="text-[11px] font-bold"
                              >
                                Kirim laporan Telegram
                              </Button>
                            )}

                            <Button
                              size="small"
                              variant="contained"
                              component={Link}
                              href={`/staff-review?batch=${encodeURIComponent(b.batch_id)}`}
                              className="text-[11px] font-bold"
                            >
                              Periksa baki
                            </Button>
                          </div>
                        </div>
                        {b.status === "on_hold" && holdForm(b.batch_id, false)}
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>

            {/* 6. HOLDING TIME FOOTER */}
            <section className="rounded-2xl border border-rule bg-paper p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <span className="font-extrabold text-ink">Batas waktu simpan makanan siap saji:</span>{" "}
                  <span className="text-ink2">Maksimal 4 jam, dihitung dari foto pertama batch, bukan dari selesai masak (asumsi demo, belum diverifikasi).</span>
                </div>
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
