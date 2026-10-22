"use client";

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 bg-paper p-6 text-ink">
    <h1 className="text-xl font-extrabold">Terjadi kesalahan</h1>
    <p className="text-sm text-ink2">Halaman belum dapat ditampilkan. Coba lagi; jika masih gagal, muat ulang halaman.</p>
    <button type="button" onClick={() => reset()} className="min-h-12 self-start rounded-xl bg-brand px-4 font-bold text-white">Coba lagi</button>
  </main>;
}
