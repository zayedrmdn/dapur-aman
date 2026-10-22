import Link from "next/link";

export default function NotFound() {
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-3 bg-paper p-6 text-ink">
    <h1 className="text-xl font-extrabold">Halaman tidak ditemukan</h1>
    <p className="text-sm text-ink2">Alamat ini tidak ada atau sudah dipindahkan.</p>
    <Link href="/staff" className="font-bold text-brand underline">Kembali ke layar staf</Link>
  </main>;
}
