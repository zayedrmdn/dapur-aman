import Button from "@mui/material/Button";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col bg-paper">
      <header className="bg-brand px-4 py-5 text-white">
        <p className="text-base font-extrabold">Dapur Aman</p>
        <p className="text-[13px]">Fondasi aplikasi siap</p>
      </header>
      <section className="flex flex-col gap-3 p-4">
        <p className="text-ink2 text-[13px]">Layar aplikasi dibangun di sini.</p>
        <Button variant="contained" size="large">
          Mulai
        </Button>
      </section>
    </main>
  );
}
