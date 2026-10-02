(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports) module.exports=api;
  if(root) root.TramoYamatoDaily=api;
})(typeof window!=="undefined"?window:globalThis,function(){
  "use strict";
  const SHIPPER_PRIORITY=["ヤマト","__OTHERS__","西原産業","トランシス","八楠","ルート産業","宏商","善心"];
  const YAMATO_SLOTS=[
    {slot:1,vehicleNumber:"11番",driverName:"刈屋"},
    {slot:2,vehicleNumber:"6528",driverName:"髙野"},
    {slot:3,vehicleNumber:"33",driverName:"若菜"}
  ];
  function dailyId(date,slot){return "daily-yamato-"+String(date)+"-"+Number(slot);}
  function buildDailyRecords(date){
    return YAMATO_SLOTS.map(x=>({
      id:dailyId(date,x.slot),date,arrivalDate:date,shipper:"ヤマト",
      loadPlace:"",unloadPlace:"",arrivalTime:"",item:"",workType:"定期",note:"",
      vehicleType:"",count:"1台",vehicleNo:x.vehicleNumber,driver:x.driverName,
      assignments:[{vehicleNumber:x.vehicleNumber,driverName:x.driverName,branchNumber:1}],
      branchNumber:1,dailyTemplate:"yamato",dailySlot:x.slot,
      boardStatus:"master",dispatchEndDate:date,boardQueryKey:"master|"+date
    }));
  }
  function rank(shipper){
    const i=SHIPPER_PRIORITY.indexOf(String(shipper||""));
    return i>=0?i:SHIPPER_PRIORITY.indexOf("__OTHERS__");
  }
  function sortMasterRows(rows){
    const othersFirst=new Map();
    rows.forEach((row,i)=>{
      const s=String(row?.record?.shipper||"");
      if(!SHIPPER_PRIORITY.includes(s)&&!othersFirst.has(s)) othersFirst.set(s,i);
    });
    return rows.map((row,i)=>({row,i})).sort((a,b)=>{
      const ar=a.row.record||{},br=b.row.record||{};
      const d=String(ar.date||"").localeCompare(String(br.date||"")); if(d) return d;
      const ra=rank(ar.shipper),rb=rank(br.shipper); if(ra!==rb) return ra-rb;
      const sa=String(ar.shipper||""),sb=String(br.shipper||"");
      if(ra===SHIPPER_PRIORITY.indexOf("__OTHERS__")&&sa!==sb) return (othersFirst.get(sa)||0)-(othersFirst.get(sb)||0);
      if(sa==="ヤマト"&&sb==="ヤマト"){
        const ya=Number(ar.dailySlot||0),yb=Number(br.dailySlot||0);
        if(ya&&yb&&ya!==yb) return ya-yb;
      }
      const ca=String(ar.caseNumber||""),cb=String(br.caseNumber||"");
      if(ca!==cb){if(!ca)return 1;if(!cb)return -1;return ca.localeCompare(cb);}
      const ba=Number(a.row.targetBranchNumber??0),bb=Number(b.row.targetBranchNumber??0);
      if(ba!==bb)return ba-bb;
      return a.i-b.i;
    }).map(x=>x.row);
  }
  return {SHIPPER_PRIORITY,YAMATO_SLOTS,dailyId,buildDailyRecords,sortMasterRows};
});
