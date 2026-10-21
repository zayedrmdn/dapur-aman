export default function Home() {
  return (
    <div>
        <header className="bg-brand px-4 pt-4 pb-4 text-white">
            {/* <div className="mx-auto flex max-w-[1440px] items-center gap-6 px-4 pt-3 md:px-6"> */}
                <div className="flex items-center justify-between text-xs">
                    <span className="text-base font-extrabold">Dapur Aman</span>
                    <div className="MuiTabs-root hidden flex-1 md:flex mui-1tfef">
                        <div style={{overflow:"hidden", marginBottom:0}} className="MuiTabs-scroller MuiTabs-fixed mui-w94xpu">
                            <div aria-label="Sections" role="tablist" className="MuiTabs-list mui-162tvoi">
                                <button className="MuiButtonBase-root MuiTab-root MuiTab-textColorInherit Mui-selected mui-1549ihg" type="button" role="tab" aria-selected="true">
                                    Today
                                    <span className="MuiTabs-indicator bg-white mui-vmn7jq"></span>
                                </button>
                                <button className="MuiButtonBase-root MuiTab-root MuiTab-textColorInherit mui-1549ihg" type="button" role="tab" aria-selected="false">
                                    Batches
                                </button>
                                <button className="MuiButtonBase-root MuiTab-root MuiTab-textColorInherit mui-1549ihg" type="button" role="tab" aria-selected="false">
                                    Menu
                                </button>
                                <button className="MuiButtonBase-root MuiTab-root MuiTab-textColorInherit mui-1549ihg" type="button" role="tab" aria-selected="false">
                                    Rules
                                </button>
                            </div>
                        </div>
                    </div>
                    <span className="ml-auto text-right text-xs leading-tight opacity-90">
                        <span className="whitespace-nowrap">Siti R., ahli gizi</span>
                        <br/>
                        <span className="whitespace-nowrap">SPPG Cibeureum</span>
                        <span className="hidden md:inline"> · </span>
                        <br className="md:hidden"/>
                        <span className="whitespace-nowrap">Thu 22 Oct · synthetic</span>
                    </span>
                </div>
            {/* </div> */}
            <h1 className="mx-auto max-w-[1440px] px-4 pt-5 pb-6 text-2xl leading-tight font-extrabold text-balance md:px-6 md:text-[30px]">5 safety findings today: 3 fixed, 1 dismissed by staff, 1 open now</h1>
        </header>
    </div>
  )
}