/* 本日の配車と点検の照合。管理画面だけで利用し、保存データは変更しない。 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object' && module.exports) module.exports=api;
  else root.TodayVehicleStatus=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  function japanDateKey(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=type=>parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  const normalize=value=>String(value||'').normalize('NFKC').replace(/[\s\u3000]+/g,'').toUpperCase();
  function nextDate(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
  const endDate=r=>String(r.arrivalDate||'')>String(r.date||'')?String(r.arrivalDate):String(r.date||'');
  const effectiveBoard=(r,today=japanDateKey())=>r.boardStatus==='advance'&&String(r.date||'')>nextDate(today)?'advance':'master';
  const active=(r,today=japanDateKey())=>effectiveBoard(r,today)==='master'&&endDate(r)>=today;
  function build({vehicles=[],inspections=[],dispatches=[],containers=[],inheritedRecords=containers,today=japanDateKey(),companyId,officeId}){
    const own=vehicles.filter(v=>v && v.name && !v.deletedAt);
    const names=new Map(),ids=new Map();
    own.forEach((v,index)=>{
      const key=normalize(v.name);
      if(!names.has(key)) names.set(key,[]);
      names.get(key).push(index);
      const id=v._cloudId||v.id;
      if(id){if(!ids.has(String(id))) ids.set(String(id),[]); ids.get(String(id)).push(index);}
    });
    const valid=r=>r && !r.deletedAt && String(r.date||'').slice(0,10)===today &&
      (!companyId || !r.companyId || String(r.companyId)===String(companyId)) &&
      (!officeId || !r.officeId || String(r.officeId)===String(officeId));
    const validDispatch=r=>r && !r.deletedAt && active(r,today) && String(r.date||'')<=today &&
      (!companyId || !r.companyId || String(r.companyId)===String(companyId)) &&
      (!officeId || !r.officeId || String(r.officeId)===String(officeId));
    const lookup=(id,name)=>{
      // If an explicit ID is supplied, never silently fall back to a different vehicle by name.
      const matches=id?ids.get(String(id)):names.get(normalize(name));
      return matches && matches.length===1?matches[0]:null;
    };
    const inspected=new Set(),assigned=new Set();
    inspections.filter(valid).forEach(r=>{
      const index=lookup(r.vehicleId||r.vehicleCloudId,r.vehicle||r.vehicleNumber);
      if(index!=null) inspected.add(index);
    });
    const inherited=new Set();
    inheritedRecords.forEach(r=>{
      if(!r || r.deletedAt) return;
      if(r.sourceDispatchId && r.sourceBranchNumber!=null) inherited.add(`src:${r.sourceDispatchId}:${r.sourceBranchNumber}`);
      if(r.caseNumber && r.branchNumber!=null) inherited.add(`case:${r.caseNumber}:${r.branchNumber}`);
    });
    const add=(id,name)=>{const index=lookup(id,name); if(index!=null) assigned.add(index);};
    dispatches.filter(validDispatch).forEach(r=>{
      const allocations=Array.isArray(r.assignments)&&r.assignments.length?r.assignments:[{vehicleNumber:r.vehicleNo,vehicleId:r.vehicleId,branchNumber:r.branchNumber}];
      allocations.forEach((a,i)=>{
        const branch=a.branchNumber??r.branchNumber??(i+1);
        if(inherited.has(`src:${r.id}:${branch}`) || (r.caseNumber && inherited.has(`case:${r.caseNumber}:${branch}`))) return;
        add(a.vehicleId||a.vehicleCloudId,a.vehicleNumber||a.vehicleNo);
      });
    });
    containers.filter(validDispatch).forEach(r=>add(r.vehicleId||r.vehicleCloudId,r.vehicleNumber));
    return {
      // 配車版を基準に3分類する。配車にない車両は noDispatch にだけ出す。
      inspected:own.filter((v,i)=>assigned.has(i)&&inspected.has(i)),
      // 本日の配車に入っている車両のうち、点検記録がない車両だけを表示する。
      // 配車にない車両は noDispatch（本日運行のない車両）にだけ出す。
      uninspected:own.filter((v,i)=>assigned.has(i)&&!inspected.has(i)),
      noDispatch:own.filter((v,i)=>!assigned.has(i)),
      registeredCount:own.length,assignedCount:assigned.size,today
    };
  }
  return {build,japanDateKey,normalize,nextDate,endDate,effectiveBoard,active};
});
