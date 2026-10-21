export default function SafetyFeedItem (
    {safetyDescription, batchID, photoID, feedTime, feedStatus, feedHandlingRemainingTime, PeopleInCharge, PICAction, foodImageUrl, percentage}
    :{safetyDescription:string, batchID: string, photoID: string, feedTime:string, feedStatus:string, feedHandlingRemainingTime:string, PeopleInCharge: string, PICAction:string, foodImageUrl:string, percentage:number}) {
    return <li className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 py-3 border-b border-rule">
        <span aria-hidden="true" className="block aspect-[4/3] rounded-lg bg-no-repeat " style={{
            backgroundImage:foodImageUrl, backgroundSize:"331.52033152033147%", backgroundPosition:"24.689562590893836% 10.979975388745942%"
        }}>
        </span>
        <div className="min-w-0">
            <div className="flex items-start gap-2">
                {/* <span class="grid shrink-0 place-items-center rounded-full bg-brand text-white" style="width:26px;height:26px"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor"><path d="M15.5 3a5.5 5.5 0 0 1 3.9 9.4l-4.2 4.2-2.1.3-2.6 2.6a2 2 0 1 1-2.6-2.6l2.6-2.6.3-2.1 4.2-4.2A5.5 5.5 0 0 1 15.5 3z"></path></svg>
                </span> */}
                <b className="text-[15px] leading-snug">{safetyDescription}</b>
            </div>
            <p className="mt-0.5 text-[13px] text-ink2">{batchID} · photo {photoID} · found {feedTime}</p>
            <div className="mt-1.5 flex items-center gap-2 text-[12px]">
                <span className="relative h-2 flex-1 rounded-full bg-rule" aria-hidden="true">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{width:percentage}}></span>
                </span>
                <span className="w-[112px] shrink-0 font-medium md:w-[150px]">{feedStatus} in {feedHandlingRemainingTime}</span>
            </div>
            <p className="mt-1 text-[13px]">{PeopleInCharge}: {PICAction}</p>
        </div>
    </li>
}