import Button from "@mui/material/Button";
import PitchPhoto from "../components/PitchPhoto";
import { ArrowIcon, DefectIcon } from "../components/icons";

const CONCERNS = [
  { kind: "spoilage" as const, title: "Kemungkinan tanda kerusakan", note: "Keamanan: terlihat oleh supervisor", tone: "bg-safety text-white" },
  { kind: "undercooked" as const, title: "Kemungkinan kurang matang", note: "Keamanan: terlihat oleh supervisor", tone: "bg-safety text-white" },
  { kind: "foreign" as const, title: "Benda asing", note: "Keamanan: terlihat oleh supervisor", tone: "bg-safety text-white" },
  { kind: "missing" as const, title: "Komponen menu salah atau kurang", note: "Kualitas: tercatat pada batch", tone: "bg-quality text-quality-ink" },
];

const HANDS = [
  { id: "snap", who: "Staf", text: "Foto setiap meja atau rak saat pengemasan. Foto dapat diambil dari berbagai sudut." },
  { id: "agents", who: "Pemeriksaan foto dan aturan", text: "Sistem menandai kemungkinan masalah dan memeriksa temuan terhadap menu dan aturan." },
  { id: "fix", who: "Staf", text: "Perbaiki dan foto ulang, atau abaikan dengan alasan. Temuan tidak ditutup otomatis." },
  { id: "supervisor", who: "Supervisor", text: "Melihat temuan keamanan dan dapat menahan batch." },
];

export default function Home() {
  return (
    <div>
        <header className="bg-brand text-white">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-4 md:px-8">
                <span className="text-xl font-extrabold">Dapur Aman{" "}
                    <span className="font-normal opacity-85">by Nexara</span>
                </span>
                <span className="hidden text-sm opacity-90 sm:inline">Agentic AI Hackathon 2026 · Team Nexara Vision</span>
            </div>
            <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pt-6 pb-12 md:grid-cols-[1fr_1.05fr] md:px-8 md:pt-10">
                <div>
                    <h1 className="text-[42px] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance md:text-[64px]">Temukan kemungkinan masalah. Bertindak sebelum disajikan.</h1>
                    <p className="mt-5 max-w-[52ch] text-lg opacity-95">Staf memotret meja pengemasan dengan ponsel. Dapur Aman membantu menandai kemungkinan masalah agar manusia dapat memeriksa dan mencatat tindakan.</p>
                    <div className="mt-7 flex flex-wrap items-center gap-3">
                        <Button component="a" href="/login" variant="contained" size="large" endIcon={<ArrowIcon />} className="h-13 bg-white px-6 text-base text-brand-dark hover:bg-mint">
                            Masuk sebagai staf atau supervisor
                        </Button>
                        <Button component="a" href="/dashboard" variant="outlined" size="large" className="h-13 border-white px-6 text-base text-white hover:border-white hover:bg-white/10">
                            Buka dasbor supervisor
                        </Button>
                    </div>
                </div>
                <PitchPhoto />
            </section>
        </header>
        <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
            <h2 className="text-2xl font-extrabold">Kemungkinan masalah yang diperiksa</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {CONCERNS.map(item => (
                    <li key={item.kind} className="flex items-start gap-3">
                        <span className={`grid shrink-0 place-items-center rounded-full ${item.tone}`} style={{ width: "52px", height: "52px" }}>
                            <DefectIcon kind={item.kind} size={27} />
                        </span>
                        <span>
                            <b className="block">{item.title}</b>
                            <span className="text-sm text-ink2">{item.note}</span>
                        </span>
                    </li>
                ))}
            </ul>
            <h2 className="mt-10 text-2xl font-extrabold">Cara kerja pemeriksaan</h2>
            <ol className="mt-4 grid gap-5 md:grid-cols-4">
                {HANDS.map(hand => (
                    <li key={hand.id} className="border-t-2 border-brand pt-3">
                        <b className="block">{hand.who}</b>
                        <span className="text-sm text-ink2">{hand.text}</span>
                    </li>
                ))}
            </ol>
        </section>
        <footer className="border-t border-rule bg-ground">
            <p className="mx-auto max-w-[1200px] px-4 py-5 text-sm text-ink2 md:px-8">Prototipe. Foto baki: “Menu makanan basah dan kering MBG I”, Meniirtjakarintan, Wikimedia Commons, CC BY-SA 4.0, dipotong; semua tanda temuan pada foto ini bersifat sintetis. Foto saja tidak dapat membuktikan keamanan makanan.</p>
        </footer>
    </div>
  );
}
