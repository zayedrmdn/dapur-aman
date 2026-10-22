"use client";
import Link from "next/link";
import Button from "@mui/material/Button";

export default function StaffShell({ title, name, children, logout }: { title: string; name?: string; children: React.ReactNode; logout?: () => void }) {
  return <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col bg-paper text-ink">
    <header className="bg-brand px-4 pt-4 pb-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link className="text-base font-extrabold" href="/staff">Dapur Aman <span className="block text-xs font-normal">by Nexara</span></Link>
          <Link href="/dashboard" className="mt-1.5 inline-flex items-center gap-1 rounded-md border border-white/30 bg-white/15 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-white/25">
            📊 Command Center →
          </Link>
        </div>
        <div className="text-right text-sm"><span>{name ?? "Akses staf dapur"}</span>{logout && <button className="mt-1 block w-full underline underline-offset-4" onClick={logout}>Keluar</button>}</div>
      </div>
      <h1 className="mt-4 text-2xl leading-tight font-extrabold text-balance">{title}</h1>
    </header>
    <div className="flex flex-1 flex-col">{children}</div>
    <p className="border-t border-rule px-4 py-3 text-xs text-ink2">Foto hanya membantu melihat kemungkinan masalah. Hasil foto bukan jaminan keamanan pangan.</p>
    <nav aria-label="Navigasi staf" className="flex flex-col gap-1 border-t border-rule p-2">
      <Button component={Link} href="/staff" fullWidth>Batch dan foto berikutnya</Button>
      <Button component={Link} href="/dashboard" variant="outlined" fullWidth className="text-xs font-bold text-brand">📊 Buka Command Center Supervisor</Button>
    </nav>
  </main>;
}
export function ErrorMessage({ children }: { children: React.ReactNode }) {
  return <p role="alert" className="border-l-4 border-safety bg-safety-bg p-3 text-sm text-safety-ink">{children}{typeof children === "string" && children.includes("Sesi berakhir") && <Link href="/login" className="mt-2 block font-bold underline">Masuk kembali</Link>}</p>;
}
export const inputClass = "min-h-12 w-full rounded-xl border border-rule bg-paper px-3 py-2 text-base text-ink";
