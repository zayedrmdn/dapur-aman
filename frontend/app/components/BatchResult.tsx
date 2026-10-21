"use client";
import { useEffect, useState, type FormEvent } from "react";
import Button from "@mui/material/Button";
import { api, time, type Batch, type Event, type Finding } from "@/lib/contracts";
import MarkedPhoto from "./MarkedPhoto";
import { ErrorMessage, inputClass } from "./StaffShell";

function FindingItem({ finding, index, batchId, refreshed }: { finding: Finding; index: number; batchId: string; refreshed: () => Promise<void> }) {
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
      <div className="min-w-0"><h3 className="font-bold">{finding.title}</h3><p className="mt-1 text-sm text-ink2">{finding.level === "safety" ? "Keamanan" : "Kualitas"} - {finding.state === "open" ? "Perlu tindakan" : finding.state === "fixed" ? "Diperbaiki oleh staf" : "Diabaikan dengan alasan"}</p></div>
    </div>
    <p className="mt-3">{finding.detail}</p>
    {finding.rule_reference && <p className="mt-2 break-words text-sm text-ink2">Rujukan aturan: {finding.rule_reference}</p>}
    {finding.evidence_gap && <p className="mt-2 text-sm">Bukti belum lengkap: {finding.evidence_gap}</p>}
    {finding.suggested_action && <p className="mt-2 text-sm"><b>Saran tindakan:</b> {finding.suggested_action}</p>}
    {finding.resolution_text && <p className="mt-3 border-l-4 border-brand bg-mint p-3 text-sm">{finding.resolution_text}</p>}
    {saved && <p role="status" className="mt-2 text-sm text-brand">Tindakan tersimpan.</p>}
    {finding.state === "open" && !saved && <form onSubmit={act} className="mt-4 flex flex-col gap-3" aria-busy={busy}>
      <label className="text-sm font-medium">Tindakan untuk temuan {index + 1}<select name="action" className={`mt-1 ${inputClass}`} disabled={busy}><option value="fixed">Sudah diperbaiki</option><option value="dismissed">Abaikan dengan alasan</option></select></label>
      <label className="text-sm font-medium">Alasan atau perbaikan<textarea name="reason" required minLength={3} maxLength={2000} rows={2} className={`mt-1 ${inputClass}`} disabled={busy} /></label>
      <Button type="submit" variant="outlined" disabled={busy}>{busy ? "Menyimpan..." : "Simpan tindakan"}</Button>
      <p className="text-xs text-ink2">Setelah perbaikan, ambil foto ulang. Agen tidak menutup temuan secara otomatis.</p>
    </form>}
    {error && <ErrorMessage>{error}</ErrorMessage>}
  </li>;
}

export default function BatchResult({ batch, refresh }: { batch: Batch; refresh: () => Promise<void> }) {
  const runs = [...batch.runs].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const [selectedRun, setSelectedRun] = useState("");
  const run = runs.find(item => item.id === selectedRun) ?? runs[0];
  const runId = run?.id;
  const [trace, setTrace] = useState<{ runId: string; events: Event[]; error?: string } | null>(null);
  useEffect(() => {
    if (!runId) return;
    let active = true;
    api<{ events: Event[] }>(`runs/${encodeURIComponent(runId)}/events`)
      .then(data => { if (active) setTrace({ runId, events: data.events }); })
      .catch(() => { if (active) setTrace({ runId, events: [], error: "Aktivitas tersimpan belum dapat dimuat. Coba muat ulang." }); });
    return () => { active = false; };
  }, [runId]);
  const findings = run ? batch.findings.filter(finding => finding.run_id === run.id) : [];
  return <section className="border-t border-rule pb-2">
    <div className="flex flex-col gap-3 p-4">
      <h2 className="text-lg font-extrabold">{batch.table_name}</h2>
      <p className="break-all text-xs text-ink2">Batch {batch.batch_id} - {batch.status === "on_hold" ? "Ditahan supervisor" : batch.status === "closed" ? "Ditutup oleh manusia" : "Dalam peninjauan"}</p>
      {runs.length > 0 && <label className="text-sm font-medium">Foto dan inspeksi<select aria-label="Foto dan inspeksi" value={run.id} onChange={event => setSelectedRun(event.target.value)} className={`mt-1 ${inputClass}`}>{runs.map((item, index) => <option key={item.id} value={item.id}>{index === 0 ? "Terbaru" : "Sebelumnya"}: {time(item.created_at)}</option>)}</select></label>}
      {run && (run.provider === "fixture" || run.provider.startsWith("test")) && <p className="border-l-4 border-quality bg-quality-bg p-3 text-sm text-quality-ink">SIMULASI / PENGUJIAN TERISOLASI - {run.provider}. Hasil ini bukan inspeksi model langsung.</p>}
      {!run ? <ErrorMessage>Belum ada inspeksi tersimpan. Unggah foto untuk mulai.</ErrorMessage> : run.state !== "completed" ? <ErrorMessage>Inspeksi {run.state === "failed" ? "gagal" : "belum selesai"}. {run.error?.message ?? "Hasil tidak dapat digunakan. Coba lagi atau ambil foto ulang."}</ErrorMessage> : <p role="status" className="border-l-4 border-quality bg-quality-bg p-3 text-sm text-quality-ink">{run.outcome === "retake_required" ? "Foto perlu diulang; bukti belum cukup." : run.outcome === "clean" ? "Tidak ada masalah terlihat pada hasil ini. Tetap lakukan pemeriksaan manusia." : "Hasil memerlukan peninjauan dan tindakan manusia."}</p>}
      {run?.uncertainty?.length > 0 && <div><h3 className="font-bold">Ketidakpastian</h3><ul className="mt-1 list-disc pl-5 text-sm">{run.uncertainty.map((note, index) => <li key={index}>{note}</li>)}</ul></div>}
      <Button variant="outlined" onClick={() => { setSelectedRun(""); void refresh(); }}>Muat ulang hasil tersimpan</Button>
    </div>
    {run && <MarkedPhoto key={run.id} url={run.photo_url} findings={findings} refresh={() => { void refresh(); }} />}
    <h2 className="px-4 pt-5 text-lg font-extrabold">Temuan pada foto terpilih</h2>
    {findings.length ? <ol>{findings.map((finding, index) => <FindingItem key={finding.id} finding={finding} index={index} batchId={batch.batch_id} refreshed={refresh} />)}</ol> : <p className="p-4 text-sm text-ink2">Tidak ada temuan tersimpan pada foto ini. Periksa status dan ketidakpastian di atas.</p>}
    {run && <details className="border-t border-rule px-4 py-4" open>
      <summary className="cursor-pointer font-bold">Aktivitas AI tersimpan</summary>
      <p className="mt-2 break-words text-xs text-ink2">{run.provider} / {run.model} - {run.id}</p>
      {trace?.runId !== run.id ? <p role="status" className="mt-2 text-sm">Memuat rekaman...</p> : trace.error ? <p className="mt-2 text-sm">{trace.error}</p> : !trace.events.length ? <p className="mt-2 text-sm">Tidak ada rekaman aktivitas untuk inspeksi ini.</p> : <ol className="mt-3 divide-y divide-rule">{trace.events.map(event => <li key={event.sequence} className="py-3 text-sm"><b>{event.sequence}. {event.agent} - {event.step}</b><p className="text-xs text-ink2">{time(event.timestamp)} - {event.status}</p><p className="mt-1">{event.summary}</p>{event.error && <p className="text-safety-ink">{event.error}</p>}{event.references.length > 0 && <p className="mt-1 break-words text-xs text-ink2">Rujukan: {event.references.join(", ")}</p>}</li>)}</ol>}
    </details>}
    {batch.actions.length > 0 && <details className="border-t border-rule px-4 py-4"><summary className="cursor-pointer font-bold">Riwayat tindakan manusia</summary><ul className="mt-2 divide-y divide-rule">{batch.actions.map(action => <li key={action.id} className="py-3 text-sm"><b>{action.actor_name}</b> - {action.action}<p>{action.reason}</p><time className="text-xs text-ink2">{time(action.created_at)}</time></li>)}</ul></details>}
  </section>;
}
