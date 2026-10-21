"use client";
import { useState, type FormEvent } from "react";
import Button from "@mui/material/Button";
import { api, ApiError } from "@/lib/contracts";
import { ErrorMessage, inputClass } from "./StaffShell";

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
export default function UploadForm({ batchId, retake = false, done }: { batchId?: string; retake?: boolean; done: (id: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    setBusy(true); setError("");
    try {
      const file = form.get("photo");
      if (!(file instanceof File) || !file.size) throw new Error("Pilih foto meja atau rak.");
      form.set("photo", await preparePhoto(file));
      if (batchId) form.set("batch_id", batchId);
      form.set("is_retake", String(retake));
      const result = await api<{ batch_id: string }>("inspect", form);
      done(result.batch_id);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Inspeksi belum berhasil.");
      if (error instanceof ApiError && error.detail?.batch_id) done(error.detail.batch_id);
    } finally { setBusy(false); }
  }
  return <section className="border-t border-rule px-4 py-5">
    <h2 className="text-lg font-extrabold">{retake ? "Foto ulang setelah tindakan" : batchId ? "Tambahkan foto ke batch ini" : "Mulai batch baru"}</h2>
    <form onSubmit={submit} className="mt-3 flex flex-col gap-4" aria-busy={busy}>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-4">
        {!batchId && !retake && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Sekolah Sasaran Distribusi MBG (Pelanggan)
            <select name="school_id" defaultValue="sch_01" className={inputClass}>
              <option value="sch_01">🏫 SDN 01 Merdeka Bandung (Alokasi: 450 Baki Siswa)</option>
              <option value="sch_02">🏫 SMPN 3 Cibeureum (Alokasi: 520 Baki Siswa)</option>
              <option value="sch_03">🏫 SDN 05 Sukajadi (Alokasi: 380 Baki Siswa)</option>
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Nama meja atau lini packing
          <input name="table_name" required maxLength={100} defaultValue={retake ? undefined : "Meja 1"} placeholder="Contoh: Meja 1" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Komponen menu yang seharusnya ada
          <textarea name="menu_items" required maxLength={2000} rows={2} defaultValue={retake ? undefined : "Nasi putih, Ayam kecap, Tumis buncis, Tahu goreng, Anggur"} placeholder="Pisahkan dengan koma: nasi, ayam, sayur" className={inputClass} />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium">Foto meja atau rak<input name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="w-full min-w-0 text-sm file:mr-3 file:rounded-xl file:border file:border-rule file:bg-mint file:px-3 file:py-3" /></label>
      </fieldset>
      <p className="text-xs text-ink2">Foto dikonversi ke JPEG, sisi panjang hingga 1600 piksel. Gunakan foto yang jelas sebelum tutup dipasang.</p>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {busy && <p role="status" className="bg-mint p-3 text-sm">Foto sedang diproses oleh Orchestrator, Vision, dan Compliance. Tunggu hasil tersimpan; jangan kirim ulang.</p>}
      <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? "Inspeksi berlangsung..." : retake ? "Periksa foto ulang" : batchId ? "Unggah ke batch ini" : "Buat Batch Baru & Periksa Foto"}</Button>
    </form>
  </section>;
}
