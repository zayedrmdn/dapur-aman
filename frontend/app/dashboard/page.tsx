"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import { api, type SupervisorDashboardData, type BatchListItem } from "@/lib/contracts";

export default function SupervisorDashboardPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [data, setData] = useState<SupervisorDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [userRole, setUserRole] = useState<string>("supervisor");
  const [userName, setUserName] = useState<string>("Supervisor Dapur MBG");
  const [filterTab, setFilterTab] = useState<"all" | "open" | "on_hold" | "closed">("all");
  const [actionNotice, setActionNotice] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [activePhotoErr, setActivePhotoErr] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<string>("");

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }));
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
      setError(err instanceof Error ? err.message : "Gagal memuat data Supervisor Command Center.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ user: { name: string; role: string } }>("session").catch(() => null),
      api<SupervisorDashboardData>("supervisor/dashboard").catch((err) => {
        if (active) setError(err instanceof Error ? err.message : "Gagal memuat data Supervisor Command Center.");
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

  async function handleHoldBatch(batchId: string, isHold: boolean) {
    setActionLoading(true);
    setActionNotice("");
    try {
      const action = isHold ? "on_hold" : "lift_hold";
      const reason = isHold
        ? "Batch ditahan oleh supervisor untuk investigasi cemaran fisik dan verifikasi baki."
        : "Penahanan batch dicabut oleh supervisor setelah baki dipastikan aman.";

      await api("actions", {
        batch_id: batchId,
        action,
        reason,
      });

      setActionNotice(
        isHold
          ? `⚠️ Batch ${batchId} berhasil ditahan (On Hold).`
          : `✅ Penahanan batch ${batchId} telah dicabut.`
      );
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
      setActionNotice(`✅ Surat Kelaikan resmi untuk ${batchId} berhasil dikirim ke Telegram Sekolah!`);
      await loadDashboard();
    } catch (err) {
      setActionNotice(err instanceof Error ? err.message : "Gagal mengirim notifikasi Telegram.");
    } finally {
      setActionLoading(false);
    }
  }

  // Filter batches list
  const filteredBatches = (data?.batches || []).filter((b: BatchListItem) => {
    if (filterTab === "open") return b.status === "finding_open";
    if (filterTab === "on_hold") return b.status === "on_hold";
    if (filterTab === "closed") return b.status === "closed";
    return true;
  });

  return (
    <div className="min-h-screen bg-[#f4f7f4] text-[#13261a]">
      {/* 1. TOP EXECUTIVE HEADER */}
      <header className="sticky top-0 z-30 border-b border-[#0d7a3e]/20 bg-[#0d7a3e] text-white shadow-md">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-white/15 text-xl font-black tracking-tight text-white shadow-inner">
              DA
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight sm:text-xl">
                  DAPUR AMAN <span className="text-xs font-normal opacity-85">by Nexara</span>
                </h1>
                <span className="hidden rounded-full border border-white/20 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold tracking-wider uppercase sm:inline-block">
                  Command Center
                </span>
              </div>
              <p className="text-xs text-white/80">
                {data?.kitchen_name || "SPPG Cibeureum (Dapur Sentral MBG)"} • Pengawasan Pangan Bergizi Gratis
              </p>
            </div>
          </div>

          {/* Quick Nav & Actor */}
          <div className="flex flex-wrap items-center gap-2 text-xs sm:gap-3">
            <div className="hidden flex-col text-right md:flex">
              <span className="font-bold text-white">{userName}</span>
              <span className="text-[11px] text-white/75">
                {userRole === "supervisor" ? "🛡️ Ahli Gizi / Supervisor Resmi" : "Akses Petugas Dapur"}
              </span>
            </div>

            <Link
              href="/staff"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-bold text-white transition hover:bg-white/20"
            >
              🍱 Meja Packing (Staff)
            </Link>

            <button
              onClick={() => loadDashboard()}
              title="Segarkan data terbaru"
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-3 py-1.5 font-bold text-white transition hover:bg-white/20"
            >
              🔄 <span className="hidden sm:inline">Segarkan</span>
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

      {/* SUB-HEADER: LIVE STATUS & TIME */}
      <div className="border-b border-emerald-950/10 bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 font-bold text-emerald-800">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2.5 rounded-full bg-emerald-600"></span>
              </span>
              REAL-TIME MULTI-AGENT AUDIT
            </span>
            <span className="hidden text-gray-400 sm:inline">•</span>
            <span className="hidden text-ink2 sm:inline">{data?.headline || "Memantau kepatuhan higiene seluruh meja"}</span>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <label className="flex cursor-pointer items-center gap-1.5 text-ink2 select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded accent-emerald-600"
              />
              Auto-refresh (20s)
            </label>
            {currentTime && (
              <span className="font-semibold text-emerald-900">
                🕒 {currentTime} WIB
              </span>
            )}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-[1280px] space-y-6 px-4 py-6 sm:px-6">
        {/* ACTION NOTICE TOAST */}
        {actionNotice && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 shadow-sm animate-fade-in">
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice("")} className="text-xs text-emerald-700 underline">
              Tutup
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900 shadow-sm">
            {error}
          </div>
        )}

        {/* 2. EXECUTIVE METRIC KPI CARDS */}
        <section aria-label="Ringkasan Kinerja Dapur" className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-5">
          {/* Card 1: Total Batches */}
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-xs font-bold text-ink2">
              <span>TOTAL BATCH</span>
              <span className="text-base">🍱</span>
            </div>
            <div className="mt-2 text-2xl font-black text-emerald-950 sm:text-3xl">
              {loading ? "..." : data?.batches.length || 0}
            </div>
            <p className="mt-1 text-[11px] text-ink2">Meja packing tercatat</p>
          </div>

          {/* Card 2: Tingkat Kelaikan */}
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-xs font-bold text-ink2">
              <span>TINGKAT KELAIKAN</span>
              <span className="text-base">🛡️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-emerald-700 sm:text-3xl">
                {loading ? "..." : `${data?.clean_pass_rate ?? 100}%`}
              </span>
              <span className="text-[10px] font-bold text-emerald-700">Lolos</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full bg-emerald-600 transition-all duration-500"
                style={{ width: `${data?.clean_pass_rate ?? 100}%` }}
              ></div>
            </div>
          </div>

          {/* Card 3: Temuan Bahaya Keamanan */}
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-xs font-bold text-ink2">
              <span>TEMUAN KRITIS</span>
              <span className="text-base">⚠️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black sm:text-3xl ${(data?.stats.open ?? 0) > 0 ? "text-red-600" : "text-emerald-700"}`}>
                {loading ? "..." : data?.stats.open || 0}
              </span>
              <span className="text-[11px] font-semibold text-ink2">Aktif</span>
            </div>
            <p className="mt-1 text-[11px] text-ink2">
              {data?.stats.fixed || 0} selesai • {data?.stats.dismissed || 0} diabaikan
            </p>
          </div>

          {/* Card 4: Baki Ditahan (On Hold) */}
          <div className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:shadow-md">
            <div className="flex items-center justify-between text-xs font-bold text-ink2">
              <span>BAKI DITAHAN</span>
              <span className="text-base">⛔</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className={`text-2xl font-black sm:text-3xl ${(data?.batches.filter(b => b.status === "on_hold").length ?? 0) > 0 ? "text-red-600" : "text-ink"}`}>
                {loading ? "..." : data?.batches.filter(b => b.status === "on_hold").length || 0}
              </span>
              <span className="text-[11px] font-semibold text-ink2">Batch</span>
            </div>
            <p className="mt-1 text-[11px] text-ink2">Instruksi investigasi</p>
          </div>

          {/* Card 5: Porsi Terdistribusi */}
          <div className="col-span-2 rounded-2xl border border-emerald-900/10 bg-gradient-to-br from-emerald-800 to-emerald-950 p-4 text-white shadow-sm transition hover:shadow-md md:col-span-1">
            <div className="flex items-center justify-between text-xs font-bold text-white/80">
              <span>PORSI SIAP KIRIM</span>
              <span className="text-base">🚚</span>
            </div>
            <div className="mt-2 text-2xl font-black sm:text-3xl">
              {loading ? "..." : `${data?.total_portions_cleared || 0}`}
            </div>
            <p className="mt-1 text-[11px] text-white/75">Baki siswa lolos uji AI</p>
          </div>
        </section>

        {/* 3. CENTERPIECE: ACTIVE URGENT CONCERN SPOTLIGHT */}
        {data?.active_concern ? (
          <section
            aria-label="Temuan Kritis yang Memerlukan Tindakan"
            className="overflow-hidden rounded-2xl border-2 border-red-500 bg-white shadow-md transition"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-full bg-red-600 text-xs font-bold text-white">
                  !
                </span>
                <h2 className="text-sm font-extrabold text-red-900 sm:text-base">
                  PERHATIAN SUPERVISOR: TEMUAN BAHAYA KEAMANAN PANGAN AKTIF
                </h2>
              </div>
              <span className="rounded-md bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white uppercase">
                Perlu Tindakan
              </span>
            </div>

            <div className="grid gap-6 p-5 md:grid-cols-[1.1fr_1fr]">
              {/* Left: Photo with bounding box */}
              <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-black">
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
                          stroke="#d7261e"
                          strokeWidth={4}
                        />
                      </svg>
                    )}
                    {data.active_concern.box && (
                      <div
                        className="absolute rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white shadow"
                        style={{
                          left: `${Math.min(80, data.active_concern.box.x_min * 100)}%`,
                          top: `${Math.max(5, data.active_concern.box.y_min * 100 - 8)}%`,
                        }}
                      >
                        ⚠️ {data.active_concern.title}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid h-[240px] place-items-center p-6 text-center text-sm text-gray-400">
                    Foto bukti baki belum dapat dimuat. Buka riwayat batch untuk memeriksa.
                  </div>
                )}
              </div>

              {/* Right: Details & Supervisor Actions */}
              <div className="flex flex-col justify-between space-y-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">
                      ID Temuan: {data.active_concern.finding_id}
                    </span>
                    <span className="text-xs text-ink2">{data.active_concern.subtitle}</span>
                  </div>

                  <h3 className="mt-2 text-xl font-extrabold text-ink">
                    {data.active_concern.title.toUpperCase()}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink2">
                    {data.active_concern.detail}
                  </p>

                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/80 p-3 text-xs text-amber-900">
                    <p className="font-bold">📋 Instruksi Standar Supervisor MBG:</p>
                    <p className="mt-0.5">
                      1. Segera instruksikan tim meja packing untuk menahan baki ini.
                      <br />
                      2. Ganti porsi yang terdampak cemaran dengan makanan higienis baru.
                      <br />
                      3. Lakukan foto ulang (*retake*) sebelum segel atau tutup dipasang.
                    </p>
                  </div>
                </div>

                {/* Supervisor Control Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
                  <Button
                    variant="contained"
                    color="error"
                    disabled={actionLoading}
                    onClick={() => handleHoldBatch(data.active_concern!.batch_id, true)}
                    className="bg-red-600 font-bold text-white"
                  >
                    {actionLoading ? "Memproses..." : `⛔ Tahan Batch (${data.active_concern.batch_id})`}
                  </Button>

                  <Button
                    variant="outlined"
                    color="primary"
                    component={Link}
                    href={`/staff-review?batch=${encodeURIComponent(data.active_concern.batch_id)}`}
                  >
                    🔍 Buka Detail Baki & Aksi Staf
                  </Button>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="flex items-center gap-4 rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
            <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-2xl">
              ✨
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-extrabold text-emerald-950">
                Semua Meja Terverifikasi Aman &amp; Higienis
              </h2>
              <p className="mt-0.5 text-xs text-ink2">
                Tidak ada temuan bahaya keamanan pangan terbuka saat ini. Seluruh batch yang berjalan memenuhi standar kelaikan BGN &amp; Permenkes No. 1096.
              </p>
            </div>
          </section>
        )}

        {/* 4. MONITORING ALOKASI SEKOLAH SASARAN MBG */}
        <section aria-label="Monitoring Sekolah Sasaran MBG" className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">Sekolah Sasaran Distribusi MBG</h2>
              <p className="text-xs text-ink2">Realisasi alokasi porsi dan status kesiapan pengiriman makanan</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.schools || []).map((sch) => {
              const isReady = sch.cleared_batches > 0 && sch.in_progress_batches === 0;
              const isWorking = sch.in_progress_batches > 0;
              const totalClearedPortions = sch.cleared_batches * sch.target_portions;

              return (
                <div
                  key={sch.id}
                  className="flex flex-col justify-between rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm transition hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-extrabold text-ink">{sch.name}</h3>
                        <p className="mt-0.5 text-xs text-ink2">
                          Kepsek: <b>{sch.principal_name}</b>
                        </p>
                        <p className="text-xs text-ink2">📞 <code>{sch.phone_number}</code></p>
                      </div>
                      <Chip
                        size="small"
                        label={isReady ? "100% SIAP" : isWorking ? "PACKING" : "STANDBY"}
                        color={isReady ? "success" : isWorking ? "warning" : "default"}
                        className="font-bold text-[10px]"
                      />
                    </div>

                    <div className="mt-4 rounded-xl bg-[#f7f9f7] p-3 text-xs">
                      <div className="flex justify-between font-semibold text-ink">
                        <span>Alokasi Porsi:</span>
                        <span className="font-bold text-emerald-800">{sch.target_portions} Baki Siswa</span>
                      </div>
                      <div className="mt-1 flex justify-between text-ink2">
                        <span>Batch Lolos Kelaikan:</span>
                        <span className="font-bold">{sch.cleared_batches} batch ({totalClearedPortions} porsi)</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-ink2 truncate max-w-[180px]">
                      📍 {sch.address}
                    </span>
                    <Button
                      size="small"
                      variant="text"
                      className="text-xs font-bold text-[#0d7a3e]"
                      component={Link}
                      href={`/staff`}
                    >
                      Periksa Meja →
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 5. DUA KOLOM: TIMELINE SAFETY FEED & BATCH MANAGEMENT TABLE */}
        <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
          {/* KOLOM KIRI: SAFETY FEED (TIMELINE AUDIT KEAMANAN) */}
          <section aria-label="Linimasa Temuan Keamanan" className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-extrabold text-ink">Linimasa Audit Keamanan (Safety Feed)</h2>
                <p className="text-xs text-ink2">Riwayat pemantauan real-time oleh Vision &amp; Compliance AI</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">
                {data?.safety_feed.length || 0} Catatan
              </span>
            </div>

            <div className="mt-4 max-h-[500px] overflow-y-auto divide-y divide-gray-100 pr-1">
              {(!data?.safety_feed || data.safety_feed.length === 0) ? (
                <p className="py-8 text-center text-xs text-ink2">Belum ada riwayat temuan bahaya keamanan pangan hari ini.</p>
              ) : (
                data.safety_feed.map((item) => (
                  <div key={item.finding_id} className="flex items-start gap-3 py-3 text-xs">
                    {/* Thumbnail or Icon */}
                    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-gray-200 bg-gray-100">
                      {item.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.thumbnail_url} alt="" className="size-full object-cover" />
                      ) : (
                        <div className="grid size-full place-items-center text-sm font-bold text-ink2">🍱</div>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="font-extrabold text-ink capitalize truncate">{item.title}</h4>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            item.status === "fixed"
                              ? "bg-emerald-100 text-emerald-800"
                              : item.status === "open"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {item.duration_label}
                        </span>
                      </div>
                      <p className="text-[11px] text-ink2">{item.subtitle}</p>
                      {item.resolution_note && (
                        <p className="mt-1 rounded bg-[#f5f9f6] p-1.5 text-[11px] font-medium text-emerald-950">
                          {item.resolution_note}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          {/* KOLOM KANAN: KONTROL DAN MANAJEMEN BATCH */}
          <section aria-label="Manajemen Batch" className="rounded-2xl border border-emerald-900/10 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
              <div>
                <h2 className="font-extrabold text-ink">Manajemen Status Batch</h2>
                <p className="text-xs text-ink2">Daftar meja packing, status lolos audit, dan kontrol supervisor</p>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 text-xs">
                {(
                  [
                    { id: "all", label: "Semua" },
                    { id: "open", label: "Perlu Tindakan" },
                    { id: "on_hold", label: "Ditahan" },
                    { id: "closed", label: "Lolos" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setFilterTab(tab.id)}
                    className={`rounded-lg px-2.5 py-1 font-bold transition ${
                      filterTab === tab.id ? "bg-white text-emerald-800 shadow-sm" : "text-ink2 hover:text-ink"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Table / List */}
            <div className="mt-4 max-h-[500px] overflow-y-auto divide-y divide-gray-100">
              {filteredBatches.length === 0 ? (
                <p className="py-8 text-center text-xs text-ink2">Tidak ada batch untuk filter ini.</p>
              ) : (
                filteredBatches.map((b) => (
                  <div key={b.batch_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-xs">
                    <div className="min-w-0 max-w-[320px]">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-ink">{b.batch_id}</span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            b.badge_color === "green"
                              ? "bg-emerald-100 text-emerald-800"
                              : b.badge_color === "red"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {b.badge_label}
                        </span>
                      </div>
                      <p className="mt-0.5 font-bold text-ink truncate">{b.menu_name}</p>
                      <p className="text-[11px] text-ink2 truncate">{b.subtitle}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Action buttons */}
                      {b.status === "on_hold" && (
                        <Button
                          size="small"
                          variant="outlined"
                          color="success"
                          disabled={actionLoading}
                          onClick={() => handleHoldBatch(b.batch_id, false)}
                          className="text-[11px] font-bold"
                        >
                          Cabut Tahanan
                        </Button>
                      )}

                      {b.status === "closed" && (
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={actionLoading}
                          onClick={() => handleSendTelegram(b.batch_id)}
                          className="border-emerald-600 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50"
                        >
                          📲 Surat Telegram
                        </Button>
                      )}

                      <Button
                        size="small"
                        variant="contained"
                        component={Link}
                        href={`/staff-review?batch=${encodeURIComponent(b.batch_id)}`}
                        className="bg-emerald-700 text-[11px] font-bold text-white hover:bg-emerald-800"
                      >
                        Periksa Baki →
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* 6. HACCP & HOLDING TIME FOOTER BANNER */}
        <section className="rounded-2xl border border-emerald-900/10 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-base">⏱️</span>
              <div>
                <span className="font-extrabold text-ink">Batas Aman Higienis Makanan Siap Saji (HACCP):</span>{" "}
                <span className="text-ink2">Maksimal 4 jam dari selesainya pengolahan (Permenkes No. 1096/2011).</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold text-emerald-800">
              <span>Sistem AI Nexara aktif memverifikasi setiap batch baki secara digital.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
