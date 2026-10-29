"use client";
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import Button from "@mui/material/Button";
import { api, ApiError } from "@/lib/contracts";
import { ErrorMessage, inputClass } from "./StaffShell";
import { CameraIcon, GalleryIcon } from "./icons";
import MenuTags, { splitMenu } from "./MenuTags";
import InspectionSteps from "./InspectionSteps";
import { runErrorLabel } from "@/lib/labels";
import { clearPendingInspection, newBatchId, readPendingInspection, savePendingInspection } from "@/lib/pending-inspection";

async function preparePhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Pilih foto JPEG, PNG, atau WebP.");
  if (file.size > 20 * 1024 * 1024) throw new Error("Foto terlalu besar. Pilih foto di bawah 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const ratio = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * ratio)); canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Foto tidak dapat diproses di perangkat ini.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Foto tidak dapat dikonversi.")), "image/jpeg", 0.9));
    if (blob.size > 4 * 1024 * 1024) throw new Error("Foto masih melebihi 4 MB. Pilih foto yang lebih kecil.");
    return new File([blob], "packing-photo.jpg", { type: "image/jpeg" });
  } finally { bitmap.close(); }
}
function PhotoPicker({ photo, previewUrl, disabled, picked }: { photo: File | null; previewUrl: string; disabled: boolean; picked: (file: File | null) => void }) {
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  function choose(event: ChangeEvent<HTMLInputElement>) {
    picked(event.target.files?.[0] ?? null);
    event.target.value = "";
  }
  return <div className="flex min-w-0 flex-col gap-1.5">
    <span className="text-sm font-medium">Foto meja atau rak</span>
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outlined" size="large" disabled={disabled} startIcon={<CameraIcon />} onClick={() => cameraInput.current?.click()}>
        Ambil Foto
      </Button>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" onChange={choose} disabled={disabled} hidden />
      <Button type="button" variant="outlined" size="large" disabled={disabled} startIcon={<GalleryIcon />} onClick={() => galleryInput.current?.click()}>
        Pilih dari Galeri
      </Button>
      <input ref={galleryInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} disabled={disabled} hidden />
    </div>
    <p className="text-xs text-ink2">Jika kamera tidak tersedia atau izinnya ditolak, pilih foto dari galeri.</p>
    {photo && <div className="mt-1 flex items-center gap-3 rounded-xl border border-rule p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- Local blob preview of the chosen photo. */}
      {previewUrl && <img src={previewUrl} alt="Pratinjau foto terpilih" className="size-16 shrink-0 rounded-lg object-cover" />}
      <p className="min-w-0 text-sm"><b className="block">Foto terpilih</b><span className="block truncate text-xs text-ink2">{photo.name}</span></p>
    </div>}
  </div>;
}


export default function UploadForm({ batchId, menu, table, retake = false, done }: { batchId?: string; menu?: string | null; table?: string; retake?: boolean; done: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [resume, setResume] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);
  function pickPhoto(file: File | null) {
    if (!file) return;
    setPhoto(file); setPreviewUrl(URL.createObjectURL(file)); setError("");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setResume("");
    try {
      if (!String(form.get("menu_items") ?? "").trim()) throw new Error("Tambahkan minimal satu komponen menu.");
      if (!photo || !photo.size) throw new Error("Ambil atau pilih foto meja atau rak.");
      form.set("photo", await preparePhoto(photo));
      if (batchId) form.set("batch_id", batchId);
      else {
        const stored = readPendingInspection();
        const nextId = stored ? stored.batchId : newBatchId();
        form.set("batch_id", nextId);
        savePendingInspection(nextId, String(form.get("table_name") ?? ""));
      }
      form.set("is_retake", String(retake));
      const result = await api<{ batch_id: string }>("inspect", form);
      clearPendingInspection();
      done(result.batch_id);
    } catch (error) {
      if (error instanceof ApiError && error.detail?.batch_id) {
        clearPendingInspection();
        setError(runErrorLabel(error.detail));
        done(error.detail.batch_id);
        return;
      }
      if (readPendingInspection()) {
        setResume(error instanceof ApiError && error.status === 429
          ? "Inspeksi Anda masih berjalan di server. Jangan kirim ulang; cek status lewat panel status inspeksi."
          : "Koneksi ke server terputus. Inspeksi mungkin masih berjalan di server; cek status lewat panel status inspeksi.");
        return;
      }
      setError(error instanceof Error ? error.message : "Inspeksi belum berhasil.");
    } finally { setBusy(false); }
  }
  function showInspectionStatus() {
    document.getElementById("dapur-inspection-status")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    window.dispatchEvent(new Event("dapur:pending-inspection"));
  }
  return <section id={retake ? "retake-form" : undefined} className="scroll-mt-4 border-t border-rule px-4 py-5">
    <h2 className="text-lg font-extrabold">{retake ? "Foto ulang setelah tindakan" : batchId ? "Tambahkan foto ke batch ini" : "Mulai batch baru"}</h2>
    <form onSubmit={submit} className="mt-3 flex flex-col gap-4" aria-busy={busy}>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        {!batchId && !retake && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Sekolah sasaran (data demo)
            <select name="school_id" defaultValue="" required className={inputClass}>
              <option value="" disabled>Pilih sekolah</option>
              <option value="sch_01">SDN 01 Merdeka Bandung (450 baki)</option>
              <option value="sch_02">SMPN 3 Cibeureum (520 baki)</option>
              <option value="sch_03">SDN 05 Sukajadi (380 baki)</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nama meja atau lini packing
          <input name="table_name" required maxLength={100} defaultValue={batchId ? table : ""} placeholder="Contoh: Meja 1" className={inputClass} />
        </label>
        <MenuTags initial={splitMenu(batchId ? menu ?? "" : "")} />
        <PhotoPicker photo={photo} previewUrl={previewUrl} disabled={busy} picked={pickPhoto} />
      </fieldset>
      <p className="text-xs text-ink2">Gunakan foto yang jelas sebelum tutup dipasang.</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {resume && <p role="alert" className="rounded-xl border border-rule bg-paper p-3 text-sm">{resume}
        <button type="button" onClick={showInspectionStatus} className="mt-2 block font-bold text-brand underline">Lihat status inspeksi</button>
      </p>}
      {busy && <InspectionSteps />}
      <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? "Inspeksi berlangsung..." : retake ? "Periksa foto ulang" : batchId ? "Unggah ke batch ini" : "Buat Batch Baru & Periksa Foto"}</Button>
    </form>
  </section>;
}
