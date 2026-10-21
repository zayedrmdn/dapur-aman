"use client";
import Link from "next/link";
import Button from "@mui/material/Button";

export default function SupervisorShell({ title, name, children, logout }: { title: string; name?: string; children: React.ReactNode; logout?: () => void }) {
  return <main className="mx-auto flex min-h-dvh w-full flex-col bg-paper text-ink">
    <header className="bg-brand px-4 pt-4 pb-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <Link className="text-base font-extrabold" href="/staff">Dapur Aman <span className="block text-xs font-normal">by Nexara</span></Link>
        <div className="text-right text-sm"><span>{name ?? "Akses staf dapur"}</span>{logout && <button className="mt-1 block w-full underline underline-offset-4" onClick={logout}>Keluar</button>}</div>
      </div>
      <h1 className="mt-5 text-2xl leading-tight font-extrabold text-balance">{title}</h1>
    </header>
    <div className="flex flex-1 flex-col">{children}</div>
    {/* <p className="border-t border-rule px-4 py-3 text-xs text-ink2">Foto hanya membantu melihat kemungkinan masalah. Hasil foto bukan jaminan keamanan pangan.</p>
    <nav aria-label="Navigasi staf" className="border-t border-rule p-2">
      <Button component={Link} href="/staff" fullWidth>Batch dan foto berikutnya</Button>
    </nav> */}
  </main>;
}