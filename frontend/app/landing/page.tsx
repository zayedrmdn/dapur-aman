export default function Home() {
  return (
    <div>
        <header className="bg-brand text-white">
            <div className="mx-auto flex max-w-[1200px] items-center justify-between px-4 py-4 md:px-8">
                <span className="text-xl font-extrabold">Dapur Aman 
                    <span className="font-normal opacity-85">by Nexara</span>
                </span>
                <span className="hidden text-sm opacity-90 sm:inline">Agentic AI Hackathon 2026 · Team Nexara Vision</span>
            </div>
            <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pt-6 pb-12 md:grid-cols-[1fr_1.05fr] md:px-8 md:pt-10">
                <div>
                    <h1 className="text-[42px] leading-[1.02] font-extrabold tracking-[-0.02em] text-balance md:text-[64px]">Spot the concern. Act before serving.</h1>
                    <p className="mt-5 max-w-[52ch] text-lg opacity-95">MBG kitchens pack hundreds of trays before dawn. Staff photograph each table with a phone; AI agents ring the food that looks wrong, and staff fix it before the lids go on.</p>
                    <div className="mt-7 flex flex-wrap gap-3">
                        <a className="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeLarge MuiButton-colorPrimary MuiButton-disableElevation h-13 bg-white px-6 text-base text-brand-dark mui-1tmyjs1" href="/login">
                            See a checked photo
                            <span className="MuiButton-icon MuiButton-endIcon mui-z06ad1">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M5 12h14M13 6l6 6-6 6"></path>
                            </svg>
                            </span>
                        </a>
                        <a className="MuiButtonBase-root MuiButton-root MuiButton-outlined MuiButton-sizeLarge MuiButton-colorPrimary MuiButton-disableElevation h-13 border-white px-6 text-base text-white mui-13nis48" href="/staff">
                            Supervisor feed
                        </a>
                    </div>
                </div>
            </section>
        </header>
        <section className="mx-auto max-w-[1200px] px-4 py-10 md:px-8">
            <h2 className="text-2xl font-extrabold">What the agents look for</h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <li className="flex items-center gap-3">
                    <span className="grid shrink-0 place-items-center rounded-full bg-safety text-white" style={{width:"52px", height:"52px"}}>
                        <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                            <path d="M4 13h16a8 8 0 0 1-16 0z" fill="currentColor" stroke="none"></path>
                            <path d="M8 9c1-1.5-1-2.5 0-4M12 9c1-1.5-1-2.5 0-4M16 9c1-1.5-1-2.5 0-4"></path>
                        </svg>
                    </span>
                    <span>
                        <b className="block">Spoilage signs</b>
                        <span className="text-sm text-ink2">Safety: supervisor sees it</span>
                    </span>
                </li>
                <li className="flex items-center gap-3">
                    <span className="grid shrink-0 place-items-center rounded-full bg-safety text-white" style={{width:"52px", height:"52px"}}>
                        <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                            <path d="M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-4.2 4.2-2.1.3-2.6 2.6a2 2 0 1 1-2.6-2.6l2.6-2.6.3-2.1 4.2-4.2A5.5 5.5 0 0 1 15.5 3z"></path>
                        </svg>
                    </span>
                    <span>
                        <b className="block">Undercooked</b>
                        <span className="text-sm text-ink2">Safety: supervisor sees it</span>
                    </span>
                </li>
                <li className="flex items-center gap-3">
                    <span className="grid shrink-0 place-items-center rounded-full bg-safety text-white" style={{width:"52px", height:"52px"}}>
                        <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="M5 18c3-9 6 3 9-6s4-5 5-7"></path>
                        </svg>
                    </span>
                    <span>
                        <b className="block">Foreign object</b>
                        <span className="text-sm text-ink2">Safety: supervisor sees it</span>
                    </span>
                </li>
                <li className="flex items-center gap-3">
                    <span className="grid shrink-0 place-items-center rounded-full bg-quality text-quality-ink" style={{width:"52px", height:"52px"}}>
                        <svg width="27" height="27" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="3 3">
                            <rect x="4" y="5" width="16" height="14" rx="3"></rect>
                        </svg>
                    </span>
                    <span>
                        <b className="block">Menu part wrong or missing</b>
                        <span className="text-sm text-ink2">Quality: batch record</span>
                    </span>
                </li>
            </ul>
            <h2 className="mt-10 text-2xl font-extrabold">One photo, four hands</h2>
            <ol className="mt-4 grid gap-5 md:grid-cols-4">
                <li className="border-t-2 border-brand pt-3">
                    <b className="block">Staff</b>
                    <span className="text-sm text-ink2">Snap each table or rack as it is packed. Messy is fine: any angle, any count.</span>
                </li>
                <li className="border-t-2 border-brand pt-3">
                    <b className="block">Vision + rules agents</b>
                    <span className="text-sm text-ink2">Ring every bad-looking spot, check it against the day&apos;s menu and the food-safety rules.</span>
                </li>
                <li className="border-t-2 border-brand pt-3">
                    <b className="block">Staff</b>
                    <span className="text-sm text-ink2">Fix and retake, or dismiss with a reason. Never a tray count, never an auto-clear.</span>
                </li>
                <li className="border-t-2 border-brand pt-3">
                    <b className="block">Supervisor</b>
                    <span className="text-sm text-ink2">Sees every safety finding, how fast it was fixed, and can hold a batch.</span>
                </li>
            </ol>
        </section>
        <footer className="border-t border-rule bg-ground">
            <p className="mx-auto max-w-[1200px] px-4 py-5 text-sm text-ink2 md:px-8">Prototype. Tray photo: “Menu makanan basah dan kering MBG I”, Meniirtjakarintan, Wikimedia Commons, CC BY-SA 4.0, cropped; every finding on it is synthetic. Photos alone cannot prove food is safe.</p>
        </footer>
    </div>
  );
}