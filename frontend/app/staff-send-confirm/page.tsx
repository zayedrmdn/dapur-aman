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
            <p className="mt-4 text-[13px] opacity-90">Batch 07 · photo 2 · Table 2 · 08:06</p>
            <h1 className="mt-0.5 text-2xl leading-tight font-extrabold text-balance">Table 2 retake checked. Siti sees your fix and your reason.</h1>
        </header>
        <div className="flex flex-1 flex-col">
            <section className="px-4 pt-2">
                <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                    <span className="grid shrink-0 place-items-center rounded-full bg-brand text-white" style={{width:"44px", height:"44px"}}>
                        <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
                            <path d="M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-4.2 4.2-2.1.3-2.6 2.6a2 2 0 1 1-2.6-2.6l2.6-2.6.3-2.1 4.2-4.2A5.5 5.5 0 0 1 15.5 3z"></path>
                        </svg>
                    </span>
                <div>
                    <b className="block text-[15px] leading-snug font-bold">Chicken may be undercooked</b>
                    <span className="text-[13px] text-ink2">
                        <span className="inline-block rounded-full px-2 py-px text-[11px] font-bold bg-safety-bg text-safety-ink">Safety</span>
                        Pink near the bone · Salmonella risk
                    </span>
                    <span className="mt-0.5 block text-[13px] text-ink">
                        <b className="text-brand">Fixed 08:11</b>
                         · Dewi: Swapped the tray; that piece went back in the wok for 6 minutes.
                    </span>
                    </div>
                </div>
                <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                    <span className="grid shrink-0 place-items-center rounded-full bg-safety-ink text-white" style={{width:"44px", height:"44px"}}>
                        <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                            <path d="M5 18c3-9 6 3 9-6s4-5 5-7"></path>
                        </svg>
                    </span>
                    <div>
                        <b className="block text-[15px] leading-snug font-bold">Something beside the tofu</b>
                        <span className="text-[13px] text-ink2">
                            <span className="inline-block rounded-full px-2 py-px text-[11px] font-bold bg-safety-bg text-safety-ink">Safety</span>
                            Possible foreign object
                        </span>
                        <span className="mt-0.5 block text-[13px] text-ink">
                            <b className="text-safety-ink">Dismissed 08:09</b>
                             · Dewi: Burnt batter from the tofu, not a foreign object.
                        </span>
                    </div>
                </div>
            <div className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-b border-rule py-2.5 last:border-b-0">
                <span className="grid shrink-0 place-items-center rounded-full bg-brand text-white" style={{width:"44px", height:"44px"}}>
                    <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.4" strokeDasharray="3 3">
                        <rect x="4" y="5" width="16" height="14" rx="3"></rect>
                    </svg>
                    </span>
                    <div>
                        <b className="block text-[15px] leading-snug font-bold">Greens are sawi, menu says buncis</b>
                        <span className="text-[13px] text-ink2">
                        <span className="inline-block rounded-full px-2 py-px text-[11px] font-bold bg-quality-bg text-quality-ink">Quality</span>
                        Menu part is wrong</span>
                        <span className="mt-0.5 block text-[13px] text-ink">
                            <b className="text-brand">Fixed 08:11</b>
                             · Dewi: Swapped in buncis from the second pot; retaken.
                        </span>
                    </div>
                </div>
            </section>
            <p className="px-4 pt-2 text-xs text-ink2">The agent re-checked the retake. Findings close on your fix or your reason; the agent never clears one on its own.</p>
            <div className="mt-auto px-4 pt-4 pb-5">
                <a className="MuiButtonBase-root MuiButton-root MuiButton-contained MuiButton-sizeMedium MuiButton-colorPrimary MuiButton-disableElevation MuiButton-fullWidth h-13 text-base mui-o1jxw0" href="staff.html">Back to batch 07</a>
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