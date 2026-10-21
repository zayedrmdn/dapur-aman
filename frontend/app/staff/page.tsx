export default function Home() {
  return (
    <div>
        <header className="bg-brand px-4 pt-4 pb-4 text-white">
            <div className="flex items-center justify-between text-xs">
                <span className="text-base font-extrabold">Dapur Aman</span>
                <span className="text-right leading-tight opacity-90">SPPG Cibeureum
                    <br/>Synthetic demo
                </span>
            </div>
            <p className="mt-4 text-[13px] opacity-90">Batch 07 · Nasi ayam kecap · 410 trays</p>
            <h1 className="mt-0.5 text-2xl leading-tight font-extrabold text-balance">4 photos checked, packing goes on</h1>
        </header>
        <div className="flex flex-1 flex-col">
            <section className="px-4 pt-4">
                <h2 className="text-sm font-bold text-ink2">Today&apos;s menu, set by Siti</h2>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    <li className="rounded-full bg-mint px-2.5 py-1 text-[13px] font-medium">
                        Nasi putih
                    </li>
                    <li className="rounded-full bg-mint px-2.5 py-1 text-[13px] font-medium">
                        Ayam kecap
                    </li>
                    <li className="rounded-full bg-mint px-2.5 py-1 text-[13px] font-medium">
                        Tumis buncis
                    </li>
                    <li className="rounded-full bg-mint px-2.5 py-1 text-[13px] font-medium">
                        Tahu goreng
                    </li>
                    <li className="rounded-full bg-mint px-2.5 py-1 text-[13px] font-medium">
                        Anggur
                    </li>
                </ul>
            </section>
            <section className="px-4 pt-5">
                <h2 className="text-sm font-bold text-ink2">Packing photos</h2>
                <ol className="mt-1">
                    <li className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-rule py-3">
                        <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 12l5 5L20 6"></path>
                            </svg>
                        </span>
                        <span>
                            <b className="block text-[15px]">Table 1</b>
                            <span className="text-[13px] text-ink2">No spots</span>
                        </span>
                        <time className="text-sm font-bold">07:58</time>
                    </li>
                    <li className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-rule py-3">
                        <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 12l5 5L20 6"></path>
                            </svg>
                        </span>
                        <span>
                            <b className="block text-[15px]">Table 2</b>
                            <span className="text-[13px] text-ink2">2 safety spots · 1 fixed, 1 dismissed · retaken</span>
                        </span>
                        <time className="text-sm font-bold">08:11</time>
                    </li>
                    <li className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-rule py-3">
                        <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 12l5 5L20 6"></path>
                            </svg>
                        </span>
                        <span>
                            <b className="block text-[15px]">Table 3</b>
                            <span className="text-[13px] text-ink2">No spots</span>
                        </span>
                        <time className="text-sm font-bold">08:15</time>
                    </li>
                    <li className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-rule py-3">
                        <span className="grid size-8 place-items-center rounded-full bg-brand text-white">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M4 12l5 5L20 6"></path>
                            </svg>
                        </span>
                        <span>
                            <b className="block text-[15px]">Rack A</b>
                            <span className="text-[13px] text-ink2">Tray cut off at the edge · retaken</span>
                        </span>
                        <time className="text-sm font-bold">08:20</time>
                    </li>
                </ol>
            </section>
            <div className="mt-auto px-4 pt-6 pb-5">
                <a className="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeLarge MuiButton-colorPrimary MuiButton-disableElevation MuiButton-fullWidth h-14 text-base mui-16n9xkz" href="staff-review.html">
                    <span className="MuiButton-icon MuiButton-startIcon mui-1ybi1tl">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 8h3l2-3h6l2 3h3v11H4z"></path>
                            <circle cx="12" cy="13" r="3.5"></circle>
                        </svg>
                    </span>Photo of the next table
                </a>
                <p className="mt-2 text-center text-xs text-ink2">One photo per table or rack, before the lids go on. Any angle is fine.</p>
            </div>
        </div>
        <div className="MuiBottomNavigation-root border-t border-rule mui-7n0g3m">
            <a className="MuiButtonBase-root MuiBottomNavigationAction-root mui-1x50sd" href="staff.html">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"></path>
                </svg>
                <span className="MuiBottomNavigationAction-label mui-1gl3sr8">Batch</span>
            </a>
            <a className="MuiButtonBase-root MuiBottomNavigationAction-root Mui-selected mui-1x50sd" href="staff-review.html">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 8h3l2-3h6l2 3h3v11H4z"></path>
                    <circle cx="12" cy="13" r="3.5"></circle>
                </svg>
                <span className="MuiBottomNavigationAction-label Mui-selected mui-1gl3sr8">Camera</span>
            </a>
        </div>
    </div>
    )
}