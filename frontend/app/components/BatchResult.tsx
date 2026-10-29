"use client";
import { useEffect, useState, type FormEvent } from "react";
import Button from "@mui/material/Button";
import { api, time, type Batch, type Event, type Finding } from "@/lib/contracts";
import { activitySummary, agentLabel, backendLabel, batchHeading, concernLabel, eventStatusLabel, runErrorLabel } from "@/lib/labels";
import MarkedPhoto from "./MarkedPhoto";
import { ErrorMessage, inputClass, TechnicalDetails } from "./StaffShell";

function FindingItem({ finding, index, batchId, canFix, refreshed }: { finding: Finding; index: number; batchId: string; canFix: boolean; refreshed: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  async function act(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setSaved(false);
    try {
      await api("actions", { batch_id: batchId, finding_id: finding.id, action: form.get("action"), reason: form.get("reason") });
      setSaved(true); await refreshed();
    } catch (error) { setError(error instanceof Error ? error.message : "Tindakan belum tersimpan."); }
    finally { setBusy(false); }
  }
  return <li id={`finding-${finding.id}`} className="scroll-mt-4 border-b border-rule px-4 py-5 last:border-b-0">
    <div className="flex items-start gap-3">
      <span className={`grid size-9 shrink-0 place-items-center rounded-full font-bold ${finding.state === "fixed" ? "bg-brand text-white" : finding.level === "safety" ? "bg-safety text-white" : "bg-quality text-quality-ink"}`}>{index + 1}</span>
      <div className="min-w-0"><h3 className="font-bold">{concernLabel(finding.title)}</h3><p className="mt-1 text-sm text-ink2">{finding.level === "safety" ? "Keamanan" : "Kualitas"} - {finding.state === "open" ? "Perlu tindakan" : finding.state === "fixed" ? "Diperbaiki oleh staf" : "Diabaikan dengan alasan"}</p></div>
    </div>
    <p className="mt-3">{finding.detail}</p>
    {finding.evidence_gap && <p className="mt-2 text-sm">Bukti belum lengkap: {finding.evidence_gap}</p>}
    {finding.suggested_action && <p className="mt-2 text-sm"><b>Saran tindakan:</b> {finding.suggested_action}</p>}
    {finding.resolution_text && <p className="mt-3 rounded-xl border border-brand bg-mint p-3 text-sm">{finding.resolution_text}</p>}
    {saved && <p role="status" className="mt-2 text-sm text-brand">Tindakan tersimpan.</p>}
    {finding.state === "open" && !saved && <form onSubmit={act} className="mt-4 flex flex-col gap-3" aria-busy={busy}>
      {!canFix && <a href="#retake-form" className="rounded-lg bg-brand px-4 py-3 text-center text-sm font-bold text-white">Perbaiki lalu foto ulang</a>}
      <label className="text-sm font-medium">Tindakan untuk temuan {index + 1}<select name="action" defaultValue={canFix ? "fixed" : "dismissed"} className={`mt-1 ${inputClass}`} disabled={busy}><option value="fixed" disabled={!canFix}>Sudah diperbaiki{canFix ? "" : " (perlu foto ulang)"}</option><option value="dismissed">Abaikan dengan alasan</option></select></label>
      <label className="text-sm font-medium">Alasan atau perbaikan<textarea name="reason" required minLength={3} maxLength={2000} rows={2} className={`mt-1 ${inputClass}`} disabled={busy} /></label>
      <Button type="submit" variant="outlined" disabled={busy}>{busy ? "Menyimpan..." : "Simpan tindakan"}</Button>
      <p className="text-xs text-ink2">{canFix ? "Foto ulang sudah diperiksa. Pastikan perbaikannya terlihat sebelum menandai diperbaiki." : "Perbaiki porsi, lalu ambil foto ulang. Temuan dapat ditandai diperbaiki setelah foto ulang selesai diperiksa."} Agen tidak menutup temuan secara otomatis.</p>
      {finding.level === "safety" && <p className="text-xs text-ink2">Jika diabaikan dengan alasan, temuan keamanan tetap terlihat oleh supervisor.</p>}
    </form>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
    <TechnicalDetails className="mt-2" items={[["ID temuan", finding.id], ["Rujukan aturan", finding.rule_reference]]} />
  </li>;
}

export default function BatchResult({ batch, refresh }: { batch: Batch; refresh: () => Promise<void> }) {
  const runs = [...batch.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [selectedRun, setSelectedRun] = useState("");
  const [focusedFinding, setFocusedFinding] = useState<{ id: string } | null>(null);
  const run = runs.find(item => item.id === selectedRun) ?? runs[0];
  const runId = run?.id;
  const [trace, setTrace] = useState<{ runId: string; events: Event[]; error?: string } | null>(null);
  const [closingBatch, setClosingBatch] = useState(false);
  const [closeError, setCloseError] = useState("");

  useEffect(() => {
    if (!focusedFinding) return;
    document.getElementById(`finding-${focusedFinding.id}`)?.scrollIntoView({ block: "center" });
  }, [focusedFinding]);

  async function handleCloseBatch() {
    setClosingBatch(true);
    setCloseError("");
    try {
      await api("actions", {
        batch_id: batch.batch_id,
        action: "close",
        reason: "Semua temuan sudah ditangani oleh manusia.",
      });
      await refresh();
    } catch (err) {
      setCloseError(err instanceof Error ? err.message : "Gagal menutup batch.");
    } finally {
      setClosingBatch(false);
    }
  }

  useEffect(() => {
    if (!runId) return;
    let active = true;
    api<{ events: Event[] }>(`runs/${encodeURIComponent(runId)}/events`)
      .then(data => { if (active) setTrace({ runId, events: data.events }); })
      .catch(() => { if (active) setTrace({ runId, events: [], error: "Aktivitas tersimpan belum dapat dimuat. Coba muat ulang." }); });
    return () => { active = false; };
  }, [runId]);
  const findings = run ? batch.findings.filter(finding => finding.run_id === run.id) : [];
  function hasRetake(finding: Finding) {
    const findingRun = runs.find(item => item.id === finding.run_id);
    return !!findingRun && runs.some(item => item.state === "completed" && item.created_at > findingRun.created_at);
  }
  const openFindings = batch.findings.filter(finding => finding.state === "open");
  const latestRun = runs[0];
  const canClose = batch.status === "in_review" && openFindings.length === 0 && latestRun?.state === "completed" && latestRun.outcome !== "retake_required";
  return <section className="border-t border-rule pb-2">
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-lg font-extrabold">{batchHeading(batch.table_name, batch.school_name)}</h2>
        {batch.menu_name && <p className="mt-1 text-sm">{batch.menu_name}</p>}
        <p className="mt-1 text-xs text-ink2">Dibuat {time(batch.created_at)} · {batch.status === "on_hold" ? "Ditahan supervisor" : batch.status === "closed" ? "Ditutup oleh manusia" : "Dalam peninjauan"}</p>
        <TechnicalDetails items={[["ID batch", batch.batch_id]]} />
      </div>
      {batch.status === "on_hold" && <p className="mx-4 break-words rounded-xl border border-safety bg-safety-bg p-3 text-sm font-semibold text-safety-ink">Batch ditahan — jangan distribusikan. {batch.hold_reason || "Lihat alasan di riwayat tindakan manusia."} Foto ulang tetap dapat dikirim; hanya supervisor yang dapat melepaskan tahanan.</p>}
      {batch.status === "closed" && <div className="rounded-xl border border-brand bg-mint p-3 text-sm text-brand-dark">
        <p className="font-bold">Batch ditutup oleh manusia</p>
        <p className="mt-1 text-xs text-ink2">Semua temuan sudah ditangani. Foto hanya membantu melihat kemungkinan masalah; hasil foto bukan jaminan keamanan pangan.</p>
        <p className="mt-2 text-xs font-semibold">Pengiriman laporan Telegram dinonaktifkan sampai pemberitahuan lebih lanjut.</p>
      </div>}
      {canClose && <div className="rounded-xl border border-brand bg-mint p-3 text-sm text-brand-dark">
        <p className="font-bold">Tidak ada temuan terbuka</p>
        <p className="mt-1 text-xs text-ink2">Periksa baki secara langsung sebelum menutup batch. Hasil foto bukan jaminan keamanan pangan.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button variant="contained" disabled={closingBatch} onClick={handleCloseBatch}>
            {closingBatch ? "Memproses..." : "Tutup batch"}
          </Button>
          {closeError && <span role="alert" className="text-xs font-bold text-safety-ink">{closeError}</span>}
        </div>
      </div>}
      {openFindings.length > 0 && <div className="rounded-xl border border-safety bg-safety-bg p-3 text-sm text-safety-ink">
        <p className="font-bold">{openFindings.length} temuan belum ditangani</p>
        <p className="mt-1">Buka setiap temuan dan catat tindakan sebelum menutup batch.</p>
        <ul className="mt-2 space-y-1">{openFindings.map(finding => <li key={finding.id}>
          {finding.run_id && runs.some(item => item.id === finding.run_id) ? <button type="button" className="min-h-11 text-left font-bold underline" onClick={() => { setSelectedRun(finding.run_id!); setFocusedFinding({ id: finding.id }); }}>{concernLabel(finding.title)} — buka foto dan tindakan</button> : <span>{concernLabel(finding.title)} — foto asal tidak tersedia; muat ulang atau hubungi supervisor.</span>}
        </li>)}</ul>
      </div>}
      {batch.status !== "closed" && <a href="#retake-form" className="min-h-11 self-start py-3 text-sm font-bold text-brand underline">Ambil foto ulang</a>}
      {runs.length > 0 && <label className="text-sm font-medium">Foto dan inspeksi<select aria-label="Foto dan inspeksi" value={run.id} onChange={event => setSelectedRun(event.target.value)} className={`mt-1 ${inputClass}`}>{runs.map((item, index) => <option key={item.id} value={item.id}>{index === 0 ? "Terbaru" : "Sebelumnya"}: {time(item.created_at)}</option>)}</select></label>}
      {run && (run.provider === "fixture" || run.provider.startsWith("test")) && <p className="rounded-xl border border-quality bg-quality-bg p-3 text-sm text-quality-ink">SIMULASI / PENGUJIAN TERISOLASI - {run.provider}. Hasil ini bukan inspeksi model langsung.</p>}
      {!run ? <ErrorMessage>Belum ada inspeksi tersimpan. Unggah foto untuk mulai.</ErrorMessage> : run.state !== "completed" ? <div><ErrorMessage>Inspeksi {run.state === "failed" ? "gagal" : "belum selesai"}. {runErrorLabel(run.error)}</ErrorMessage><TechnicalDetails items={[["Kode", run.error?.code], ["Tahap", run.error?.stage], ["Pesan", run.error?.message]]} /></div> : <p role="status" className="rounded-xl border border-quality bg-quality-bg p-3 text-sm text-quality-ink">{run.outcome === "retake_required" ? "Foto perlu diulang; bukti belum cukup." : run.outcome === "clean" ? "Tidak ada masalah terlihat pada hasil ini. Tetap lakukan pemeriksaan manusia." : "Hasil memerlukan peninjauan dan tindakan manusia."}</p>}
      {run?.uncertainty?.length > 0 && <div><h3 className="font-bold">Ketidakpastian</h3><ul className="mt-1 list-disc pl-5 text-sm">{run.uncertainty.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      <Button variant="outlined" onClick={() => { setSelectedRun(""); void refresh(); }}>Muat ulang hasil tersimpan</Button>
    </div>
    {run && <MarkedPhoto key={run.id} url={run.photo_url} findings={findings} refresh={() => { void refresh(); }} />}
    <h2 className="px-4 pt-5 text-lg font-extrabold">Temuan pada foto terpilih</h2>
    {findings.length ? <ol>{findings.map((finding, index) => <FindingItem key={finding.id} finding={finding} index={index} batchId={batch.batch_id} canFix={hasRetake(finding)} refreshed={refresh} />)}</ol> : <p className="p-4 text-sm text-ink2">Tidak ada temuan tersimpan pada foto ini. Periksa status dan ketidakpastian di atas.</p>}
    {run && <details className="border-t border-rule px-4 py-4">
      <summary className="cursor-pointer py-2.5 font-bold">Aktivitas AI tersimpan</summary>
      <TechnicalDetails className="mt-1" items={[["Penyedia model", `${run.provider} / ${run.model}`], ["ID inspeksi", run.id]]} />
      {trace?.runId !== run.id ? <p role="status" className="mt-2 text-sm">Memuat rekaman...</p> : trace.error ? <p className="mt-2 text-sm">{trace.error}</p> : !trace.events.length ? <p className="mt-2 text-sm">Tidak ada rekaman aktivitas untuk inspeksi ini.</p> : <ol className="mt-3 divide-y divide-rule">{trace.events.map(event => {
        const summary = activitySummary(event.summary);
        const isTool = event.kind === "tool_call";
        return <li key={event.sequence} className="py-3 text-sm"><b>{event.sequence}. {agentLabel(event.agent)}</b>{isTool ? " · alat pemeriksaan" : event.step.toLowerCase() !== event.agent.toLowerCase() && <> · {agentLabel(event.step)}</>}<p className="text-xs text-ink2">{time(event.timestamp)} · {eventStatusLabel(event.status)}</p><p className="mt-1 break-words">{summary}</p>
          {(isTool || event.error || event.references.length > 0) && <TechnicalDetails items={[["Alat", isTool ? event.step : null], ["Ringkasan asli", summary !== event.summary ? event.summary : null], ["Galat", event.error], ["Rujukan", event.references.join(", ")]]} />}</li>;
      })}</ol>}
    </details>}
    {batch.actions.length > 0 && <details className="border-t border-rule px-4 py-4"><summary className="cursor-pointer py-2.5 font-bold">Riwayat tindakan manusia</summary><ul className="mt-2 divide-y divide-rule">{batch.actions.map(action => <li key={action.id} className="py-3 text-sm"><b>{action.actor_name}</b> - {backendLabel(action.action)}<p>{action.reason}</p><time className="text-xs text-ink2">{time(action.created_at)}</time></li>)}</ul></details>}
  </section>;
}
