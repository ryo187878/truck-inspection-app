/**
 * TRAMO Dispatch Service (Shared Core)
 * test/index.html と rules-tests/firestore.rules.test.js で100%同一の保存ロジックを共有するモジュール。
 */
(function (root, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define(factory);
  } else {
    root.DispatchService = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';


  function japanDateKey(now=new Date()){
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
    const get=k=>parts.find(p=>p.type===k).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  function nextDate(date){const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
  function isValidDateKey(value){
    const s=String(value||'');
    const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if(!m) return false;
    const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
    const dt=new Date(Date.UTC(y,mo-1,d));
    return dt.getUTCFullYear()===y && dt.getUTCMonth()===mo-1 && dt.getUTCDate()===d;
  }
  function validateDispatchDates(date,arrivalDate){
    const start=String(date||'');
    const arrival=String(arrivalDate||'');
    if(!isValidDateKey(start)) throw new Error("日付を確認してください。");
    if(arrival && !isValidDateKey(arrival)) throw new Error("着日を確認してください。");
    if(arrival && arrival<start) throw new Error("着日は開始日以降を指定してください。");
  }
  function dispatchEndDate(r){
    const date=String(r.date||'').slice(0,10), arrival=String(r.arrivalDate||'').slice(0,10);
    return arrival>date?arrival:date;
  }
  function effectiveBoard(r,today=japanDateKey()){
    if(r.boardStatus==='advance' && String(r.date||'')>nextDate(today)) return 'advance';
    return 'master';
  }
  function boardMetadata(record, requested='master'){
    const boardStatus=record.boardStatus||requested;
    if(!['master','advance'].includes(boardStatus)) throw new Error('配車の表示先を確認してください。');
    const end=dispatchEndDate(record);
    return {boardStatus,dispatchEndDate:end,boardQueryKey:boardStatus+'|'+(boardStatus==='advance'?record.date:end)};
  }
  async function moveDispatchToMasterCore({firestoreDb,runTransaction,doc,companyId,officeId,kind='general',recordId,today=japanDateKey()}){
    if(!companyId || !officeId || !recordId || !['general','container'].includes(kind)) throw new Error('移動対象を確認してください。');
    const col=kind==='container'?'containerDispatchRecords':'dispatchRecords';
    const ref=doc(firestoreDb,`companies/${companyId}/offices/${officeId}/${col}/${recordId}`);
    return runTransaction(firestoreDb,async tx=>{
      const snap=await tx.get(ref);if(!snap.exists()) throw new Error('配車が削除されています。');
      const record={...snap.data(),id:String(recordId)};
      if((record.companyId && record.companyId!==companyId)||(record.officeId && record.officeId!==officeId)) throw new Error('所属が異なります。');
      if(record.boardStatus!=='advance') return record;
      if(String(record.date||'')>nextDate(today)) return record;
      const update={...boardMetadata({...record,boardStatus:'master'}),boardMovedAt:new Date().toISOString()};
      tx.set(ref,update,{merge:true});return {...record,...update};
    });
  }

  function cleanUndefined(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    const clean = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        clean[key] = (value && typeof value === 'object' && !Array.isArray(value)) ? cleanUndefined(value) : value;
      }
    }
    return clean;
  }

  function newStageId(kind){
    return typeof crypto!=="undefined" && crypto.randomUUID ? crypto.randomUUID() : `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  async function reserveStageSlots({transaction,doc,firestoreDb,recordsPath,caseNumber,caseData,stages,recordIds,otherIds,kind}){
    const registry={...(caseData?.stageRecordIds||{})};
    const key=r=>kind==='general'?`general_${Number(r.vehicleSlot)||1}_${Number(r.stageNo)}`:`container_${Number(r.stageNo)||1}`;
    const others=new Map();
    for(const id of new Set(otherIds||[])){
      const snap=await transaction.get(doc(firestoreDb,`${recordsPath}/${id}`));
      if(!snap.exists() || snap.data().caseNumber!==caseNumber) throw new Error("同じ案件の既存工程が変更・削除されています。再読込してください。");
      const data=snap.data();others.set(String(id),data);
      if(data.stageNo!=null) registry[key(data)]=String(id);
    }
    const submitted=new Set();
    for(let i=0;i<stages.length;i++){
      const st=stages[i],slot=key(st),id=recordIds[i];
      if(submitted.has(slot)) throw new Error("同じ車両枠の同じ工程を重複登録できません。");
      submitted.add(slot);
      const occupied=registry[slot];
      if(occupied && occupied!==id){
        const snap=await transaction.get(doc(firestoreDb,`${recordsPath}/${occupied}`));
        if(snap.exists()) throw new Error("この工程はすでに登録されています。再読込して確認してください。");
      }
      registry[slot]=id;
    }
    return {registry,others};
  }

  /**
   * 先行配車（一般配車）のトランザクション保存コア
   */
  async function saveDispatchRecordCore({
    firestoreDb,
    runTransaction,
    doc,
    companyId,
    officeId,
    record,
    options = {}
  }) {
    if (!companyId || !officeId) throw new Error("companyId and officeId are required.");
    validateDispatchDates(record?.date, record?.arrivalDate);
    const recordId = String(record.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `disp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`));
    const now = new Date().toISOString();

    const counterPath = `companies/${companyId}/offices/${officeId}/counters/cases`;
    const casesColPath = `companies/${companyId}/offices/${officeId}/cases`;
    const recordsColPath = `companies/${companyId}/offices/${officeId}/dispatchRecords`;

    const recordRef = doc(firestoreDb, `${recordsColPath}/${recordId}`);
    const counterRef = doc(firestoreDb, counterPath);

    return await runTransaction(firestoreDb, async (transaction) => {
      // transaction内で既存レコードを先行読み込み（RulesのbranchNumber不変制約と整合させる）
      const recordSnap = await transaction.get(recordRef);
      const existingRecord = recordSnap.exists() ? recordSnap.data() : null;
      if(options.requireExisting && !existingRecord) throw new Error("編集中の配車が削除されています。再読込してください。");

      let finalCaseNumber = existingRecord?.caseNumber || record.caseNumber || options.targetCaseNumber || "";
      let assignments = Array.isArray(record.assignments) && record.assignments.length
        ? record.assignments.slice()
        : [{ vehicleNumber: record.vehicleNo || "", driverName: record.driver || "" }];

      let caseRef = null;
      let caseSnap = null;

      if (!finalCaseNumber) {
        // 新規案件採番
        const counterSnap = await transaction.get(counterRef);
        const currentSeq = (counterSnap.exists() ? (Number(counterSnap.data()?.lastSequence) || 0) : 0);
        const nextSeq = currentSeq + 1;
        finalCaseNumber = "T" + String(nextSeq).padStart(6, "0");

        const count = assignments.length;
        assignments = assignments.map((a, idx) => ({
          ...a,
          branchNumber: idx + 1
        }));

        caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
        transaction.set(counterRef, {
          lastSequence: nextSeq,
          companyId,
          officeId,
          updatedAt: now
        }, { merge: true });

        transaction.set(caseRef, {
          caseNumber: finalCaseNumber,
          companyId,
          officeId,
          shipper: String(record.shipper || "").trim(),
          nextBranch: count + 1,
          maxBranch: count,
          inheritedBranches: [],
          createdAt: now,
          updatedAt: now
        });
      } else {
        // 既存案件の維持または引き継ぎ
        caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
        caseSnap = await transaction.get(caseRef);
        let caseData = caseSnap.exists() ? (caseSnap.data() || {}) : null;
        let nextBranch = caseData ? (Number(caseData.nextBranch) || 1) : 1;
        let maxBranch = caseData ? (Number(caseData.maxBranch) || 0) : 0;
        let inheritedBranches = Array.isArray(caseData?.inheritedBranches) ? caseData.inheritedBranches.slice() : [];

        assignments = assignments.map((a) => {
          if (a.branchNumber != null && a.branchNumber !== "") {
            return a;
          }
          const assignedBranch = nextBranch;
          nextBranch++;
          maxBranch = Math.max(maxBranch, assignedBranch);
          return {
            ...a,
            branchNumber: assignedBranch
          };
        });

        const casePayload = {
          caseNumber: finalCaseNumber,
          companyId,
          officeId,
          shipper: String(record.shipper || caseData?.shipper || "").trim(),
          nextBranch,
          maxBranch,
          inheritedBranches,
          updatedAt: now
        };
        if (!caseData) casePayload.createdAt = now;
        transaction.set(caseRef, casePayload, { merge: true });
      }

      // 最上位branchNumberの決定：
      // 既存採番済みレコードの更新時は、元の最上位branchNumberを絶対に保持する（不変Rulesに違反しない）。
      // 新規作成時のみ、割当の先頭枝番（または指定された枝番）を設定する。
      let finalTopBranchNumber;
      if (existingRecord && existingRecord.branchNumber != null && existingRecord.branchNumber !== "") {
        finalTopBranchNumber = Number(existingRecord.branchNumber);
      } else if (record.branchNumber != null && record.branchNumber !== "") {
        finalTopBranchNumber = Number(record.branchNumber);
      } else {
        finalTopBranchNumber = assignments[0]?.branchNumber || 1;
      }

      const savedData = cleanUndefined({
        ...record,
        ...boardMetadata({...record,boardStatus:existingRecord?.boardStatus||record.boardStatus||options.boardStatus||"master"}),
        id: recordId,
        caseNumber: finalCaseNumber,
        branchNumber: finalTopBranchNumber,
        assignments,
        vehicleNo: assignments[0]?.vehicleNumber || "",
        driver: assignments[0]?.driverName || "",
        count: `${assignments.length}台`,
        companyId,
        officeId,
        cloudUpdatedAt: now
      });

      transaction.set(recordRef, savedData);
      return savedData;
    });
  }

    /**
     * 海コン案件と各工程（1〜3工程）のアトミック保存トランザクションコア
     */
    async function saveContainerCaseStagesCore({
      firestoreDb,
      runTransaction,
      doc,
      companyId,
      officeId,
      caseInfo,
      stages = [],
      options = {}
    }) {
      if (!companyId || !officeId) throw new Error("companyId and officeId are required.");
      if (!Array.isArray(stages) || stages.length === 0) {
        throw new Error("少なくとも1つの工程を選択してください。");
      }
      caseInfo=caseInfo||{};
      for(const st of stages){
        if(![1,2,3].includes(Number(st.stageNo))) throw new Error("工程・日付を確認してください。");
        validateDispatchDates(st.date, st.arrivalDate);
      }
      const recordIds=stages.map(st=>String(st.id||newStageId('cont')));
      const now = new Date().toISOString();

      const counterPath = `companies/${companyId}/offices/${officeId}/counters/cases`;
      const casesColPath = `companies/${companyId}/offices/${officeId}/cases`;
      const containerRecordsColPath = `companies/${companyId}/offices/${officeId}/containerDispatchRecords`;
      const dispatchRecordsColPath = `companies/${companyId}/offices/${officeId}/dispatchRecords`;

      const counterRef = doc(firestoreDb, counterPath);

      return await runTransaction(firestoreDb, async (transaction) => {
        let finalCaseNumber = caseInfo.caseNumber || options.targetCaseNumber || "";
        let caseRef = null;
        let caseSnap = null;
        let nextBranch = 1;
        let maxBranch = 0;
        let inheritedBranches = [];
        let newCounterSeq = null; // 新規採番時のみ設定。全読取完了後にまとめて書き込む

        if (!finalCaseNumber) {
          // 新規海コン案件採番（カウンターへの書込は全読取完了後に行う：Firestoreトランザクションの読取/書込順序制約のため）
          const counterSnap = await transaction.get(counterRef);
          const currentSeq = (counterSnap.exists() ? (Number(counterSnap.data()?.lastSequence) || 0) : 0);
          newCounterSeq = currentSeq + 1;
          finalCaseNumber = "T" + String(newCounterSeq).padStart(6, "0");
          caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);

          nextBranch = 1;
          maxBranch = 0;
          inheritedBranches = [];
        } else {
          caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
          caseSnap = await transaction.get(caseRef);
          if (caseSnap.exists()) {
            const caseData = caseSnap.data() || {};
            nextBranch = Number(caseData.nextBranch) || 1;
            maxBranch = Number(caseData.maxBranch) || 0;
            inheritedBranches = Array.isArray(caseData.inheritedBranches) ? caseData.inheritedBranches.slice() : [];
          }
        }

        const existingStageData=new Map();
        const seenIds=new Set();
        for(const st of stages){
          if(!st.id) continue;
          const id=String(st.id);
          if(seenIds.has(id)) throw new Error("工程IDが重複しています。");
          seenIds.add(id);
          const snap=await transaction.get(doc(firestoreDb,`${containerRecordsColPath}/${id}`));
          if(!snap.exists()) throw new Error("編集中の工程が削除されています。再読込してください。");
          const data=snap.data();
          if(data.caseNumber!==finalCaseNumber || Number(data.branchNumber)!==Number(st.branchNumber) || (Number(data.stageNo)||1)!==Number(st.stageNo)) throw new Error("工程の案件番号・枝番は変更できません。");
          existingStageData.set(id,data);
        }
        const reserved=await reserveStageSlots({transaction,doc,firestoreDb,recordsPath:containerRecordsColPath,caseNumber:finalCaseNumber,caseData:caseSnap?.exists()?caseSnap.data():null,stages,recordIds,otherIds:options.otherExistingStageIds,kind:'container'});
        // ソート：工程番号順 (stageNo 1 -> 2 -> 3)
        const sortedStages = stages.slice().sort((a, b) => (Number(a.stageNo) || 0) - (Number(b.stageNo) || 0));
        const assignmentKey=st=>{
          const vehicle=String(st?.vehicleNumber||"").trim();
          const driver=String(st?.driverName||"").trim();
          return vehicle && driver ? `${vehicle}\u0000${driver}` : "";
        };
        const branchByAssignment=new Map();
        for(const data of reserved.others.values()){
          const branch=Number(data?.branchNumber);
          const key=assignmentKey(data);
          if(Number.isInteger(branch) && branch>0){
            maxBranch=Math.max(maxBranch,branch);
            nextBranch=Math.max(nextBranch,branch+1);
            const current=key ? branchByAssignment.get(key) : null;
            if(key && (current==null || branch<current)) branchByAssignment.set(key,branch);
          }
        }
        for(const data of existingStageData.values()){
          const branch=Number(data?.branchNumber);
          if(Number.isInteger(branch) && branch>0){
            maxBranch=Math.max(maxBranch,branch);
            nextBranch=Math.max(nextBranch,branch+1);
          }
        }

        // 枝番割り当て
        // 1. 既存の枝番を持っている工程、または引継ぎ指定された工程を先に決定
        const processedStages = [];
        for (const st of sortedStages) {
          let branch = (st.branchNumber != null && st.branchNumber !== "") ? Number(st.branchNumber) : null;
          // isInherited は各工程自身の isInheritedFromDispatch フラグでのみ判定する。
          // options.inheritBranchNumber 等はグローバル指定だが、対象はこのフラグが立つ工程1つに限定する（他工程へ誤って波及させない）。
          const previous=existingStageData.get(String(st.id));
          let isInherited = previous ? !!previous.sourceDispatchId : !!st.isInheritedFromDispatch;
          let sourceDispatchId = previous ? (previous.sourceDispatchId||null) : (isInherited ? (st.sourceDispatchId || options.sourceDispatchId || null) : null);
          let sourceBranchNumber = isInherited
            ? (st.sourceBranchNumber != null ? Number(st.sourceBranchNumber) : (options.sourceBranchNumber != null ? Number(options.sourceBranchNumber) : null))
            : null;

          if (branch == null && isInherited) {
            branch = (options.inheritBranchNumber != null) ? Number(options.inheritBranchNumber) : sourceBranchNumber;
            sourceBranchNumber = branch;
          }

          if(previous) sourceBranchNumber=previous.sourceBranchNumber??null;
          if(previous && branch!=null){
            const key=assignmentKey(st);
            const sameAssignmentBranch=key ? branchByAssignment.get(key) : null;
            const assignmentChanged=key!==assignmentKey(previous);
            const conflictsCurrentBranch=[...reserved.others.values()].some(data=>{
              if(Number(data?.branchNumber)!==branch) return false;
              const otherKey=assignmentKey(data);
              return !key || !otherKey || otherKey!==key;
            }) || (assignmentChanged && sortedStages.some(other=>{
              if(other===st || Number(other?.branchNumber)!==branch) return false;
              const otherKey=assignmentKey(other);
              return !key || !otherKey || otherKey!==key;
            }));
            if(sameAssignmentBranch!=null && sameAssignmentBranch!==branch) branch=sameAssignmentBranch;
            else if(conflictsCurrentBranch) branch=null;
          }
          if(!previous && branch!=null && !isInherited) throw new Error("新規工程には既存の枝番を指定できません。");
          if (branch != null) {
            if (isInherited && !previous) {
              // 引継ぎ重複検証
              if (inheritedBranches.includes(branch)) {
                throw new Error(`案件 ${finalCaseNumber} の枝番 ${branch} はすでにコンテナ配車へ引継ぎ済みです。`);
              }

              // 引継ぎ元先行配車の検証（単一配車のみ）
              if (sourceDispatchId) {
                const sourceRef = doc(firestoreDb, `${dispatchRecordsColPath}/${sourceDispatchId}`);
                const sourceSnap = await transaction.get(sourceRef);
                if (!sourceSnap.exists()) {
                  throw new Error("引継ぎ元の先行配車データが見つかりません。");
                }
                const sourceData = sourceSnap.data() || {};
                if(sourceData.caseNumber!==finalCaseNumber) throw new Error("引継ぎ元データの案件番号が一致しません。");
                const sourceAssignments=sourceData.assignments?.length?sourceData.assignments:[{branchNumber:sourceData.branchNumber||1}];
                if(!sourceAssignments.some((a,i)=>Number(a.branchNumber??i+1)===branch)) throw new Error("引継ぎ元の枝番が一致しません。");
                const countNum = Math.max(1, parseInt(String(sourceData.count || "1").replace(/[^0-9]/g, ""), 10) || 1);
                const assigns = Array.isArray(sourceData.assignments) ? sourceData.assignments : [];
                if (assigns.length > 1 || countNum > 1) {
                  throw new Error("複数台の一般物案件から1台のみを引き継ぐことはできません。単一配車のみ引継ぎ可能です。");
                }
              }

              inheritedBranches.push(branch);
              maxBranch = Math.max(maxBranch, branch);
              nextBranch = Math.max(nextBranch, branch + 1);
            } else {
              maxBranch = Math.max(maxBranch, branch);
              nextBranch = Math.max(nextBranch, branch + 1);
            }
            const key=assignmentKey(st);
            if(key && !branchByAssignment.has(key)) branchByAssignment.set(key,branch);
            processedStages.push({ ...st, branchNumber: branch, sourceDispatchId, sourceBranchNumber });
          } else {
            processedStages.push({ ...st, branchNumber: null, sourceDispatchId, sourceBranchNumber });
          }
        }

        // 2. 新規工程は同じ車番＋乗務員なら現在有効な枝番を共有し、異なる組み合わせだけ新しい枝番を発行する
        nextBranch=Math.max(nextBranch,maxBranch+1);
        for (const st of processedStages) {
          if (st.branchNumber == null) {
            const key=assignmentKey(st);
            const sameAssignmentBranch=key ? branchByAssignment.get(key) : null;
            if(sameAssignmentBranch!=null){
              st.branchNumber=sameAssignmentBranch;
            }else{
              st.branchNumber = nextBranch;
              nextBranch++;
              maxBranch = Math.max(maxBranch, st.branchNumber);
              if(key) branchByAssignment.set(key,st.branchNumber);
            }
          }
        }

        // 海コン枝番は「現在の車番＋乗務員グループ」を工程順に 1,2,3... で採番する。
        // 同じ組み合わせは同じ枝番、未入力は同一グループ扱いしない。
        const processedEntries=processedStages.map(st=>{
          const sourceIndex=stages.findIndex(source=>source===st || Number(source.stageNo)===Number(st.stageNo));
          return {id:String(recordIds[sourceIndex]),stage:st};
        });
        const activeEntries=[
          ...[...reserved.others.entries()].map(([id,data])=>({id:String(id),stage:{...data}})),
          ...processedEntries
        ].sort((a,b)=>(Number(a.stage.stageNo)||0)-(Number(b.stage.stageNo)||0));
        const normalizedBranchByAssignment=new Map();
        const normalizedBranchById=new Map();
        let normalizedNextBranch=1;
        for(const entry of activeEntries){
          const key=assignmentKey(entry.stage);
          let branch=key ? normalizedBranchByAssignment.get(key) : null;
          if(branch==null){
            branch=normalizedNextBranch++;
            if(key) normalizedBranchByAssignment.set(key,branch);
          }
          normalizedBranchById.set(entry.id,branch);
        }
        processedEntries.forEach(entry=>{ entry.stage.branchNumber=normalizedBranchById.get(entry.id); });
        maxBranch=Math.max(0,normalizedNextBranch-1);
        nextBranch=normalizedNextBranch;

        const chassisNumber=String(caseInfo.chassisNumber != null ? caseInfo.chassisNumber : (caseSnap?.exists() && caseSnap.data().chassisNumber != null ? caseSnap.data().chassisNumber : (processedStages.find(st=>st.chassisNumber)?.chassisNumber||""))).trim();
        // 案件ドキュメントの保存 / 更新
        if (newCounterSeq != null) {
          transaction.set(counterRef, {
            lastSequence: newCounterSeq,
            companyId,
            officeId,
            updatedAt: now
          }, { merge: true });
        }

        const casePayload = {
          chassisNumber,
          stageRecordIds:reserved.registry,
          caseType: "container",
          caseNumber: finalCaseNumber,
          companyId,
          officeId,
          shipper: String(caseInfo.shipper || "").trim(),
          containerNumber: String(caseInfo.containerNumber || "").trim(),
          ft: String(caseInfo.ft || "20"),
          item: String(caseInfo.item || "").trim(),
          commonNote: String(caseInfo.commonNote || "").trim(),
          nextBranch,
          maxBranch,
          inheritedBranches,
          updatedAt: now,
          ...(caseSnap && caseSnap.exists() ? {} : { createdAt: now })
        };
        transaction.set(caseRef, casePayload, { merge: true });

        // 各工程レコードの保存（共通情報も同期）
        const savedStageRecords = [];
        for (const st of processedStages) {
          const recordId = recordIds[stages.findIndex(source=>source===st || (Number(source.stageNo)===Number(st.stageNo)))];
          const recordRef = doc(firestoreDb, `${containerRecordsColPath}/${recordId}`);

          const recordPayload = cleanUndefined({
            ...boardMetadata(st,"master"),
            id: recordId,
            caseNumber: finalCaseNumber,
            branchNumber: st.branchNumber,
            stageNo: Number(st.stageNo),
            stageName: st.stageName || (Number(st.stageNo) === 1 ? "搬出" : (Number(st.stageNo) === 2 ? "荷役" : "搬入・返却")),
            content: st.content,
            date: st.date,
            origin: st.origin || "",
            destination: st.destination || "",
            vehicleNumber: st.vehicleNumber || "",
            chassisNumber,
            driverName: st.driverName || "",
            time: st.time || "",
            note: st.note || "",
            // 共通情報（全工程で一致させる）
            shipper: String(caseInfo.shipper || "").trim(),
            containerNumber: String(caseInfo.containerNumber || "").trim(),
            ft: String(caseInfo.ft || "20"),
            item: String(caseInfo.item || "").trim(),
            commonNote: String(caseInfo.commonNote || "").trim(),
            sourceDispatchId: st.sourceDispatchId || null,
            sourceBranchNumber: st.sourceBranchNumber || null,
            companyId,
            officeId,
            cloudUpdatedAt: now
          });

          transaction.set(recordRef, recordPayload);
          savedStageRecords.push(recordPayload);
        }

        // もしこの案件に属する他の既存工程があれば、コンテナ番号・荷主などの共通情報を同期
        if (Array.isArray(options.otherExistingStageIds) && options.otherExistingStageIds.length > 0) {
          for (const otherId of options.otherExistingStageIds) {
            const otherRef = doc(firestoreDb, `${containerRecordsColPath}/${otherId}`);
            transaction.set(otherRef, cleanUndefined({
              branchNumber: normalizedBranchById.get(String(otherId)),
              chassisNumber,
              shipper: String(caseInfo.shipper || "").trim(),
              containerNumber: String(caseInfo.containerNumber || "").trim(),
              ft: String(caseInfo.ft || "20"),
              item: String(caseInfo.item || "").trim(),
              commonNote: String(caseInfo.commonNote || "").trim(),
              cloudUpdatedAt: now
            }), { merge: true });
          }
        }

        return {
          caseNumber: finalCaseNumber,
          caseInfo: casePayload,
          stages: savedStageRecords,
          branchUpdates:[...normalizedBranchById.entries()].map(([id,branchNumber])=>({id,branchNumber}))
        };
      });
    }

  /**
   * コンテナ配車のトランザクション保存コア（重複引継ぎ防止・アトミック検証付き）
   */
  async function saveContainerDispatchRecordCore({
    firestoreDb,
    runTransaction,
    doc,
    companyId,
    officeId,
    record,
    options = {}
  }) {
    if (!companyId || !officeId) throw new Error("companyId and officeId are required.");
    validateDispatchDates(record?.date, record?.arrivalDate);
    const recordId = String(record.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `cont-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`));
    const now = new Date().toISOString();

    const counterPath = `companies/${companyId}/offices/${officeId}/counters/cases`;
    const casesColPath = `companies/${companyId}/offices/${officeId}/cases`;
    const containerRecordsColPath = `companies/${companyId}/offices/${officeId}/containerDispatchRecords`;
    const dispatchRecordsColPath = `companies/${companyId}/offices/${officeId}/dispatchRecords`;

    const recordRef = doc(firestoreDb, `${containerRecordsColPath}/${recordId}`);
    const counterRef = doc(firestoreDb, counterPath);

    return await runTransaction(firestoreDb, async (transaction) => {
      let finalCaseNumber = record.caseNumber || options.targetCaseNumber || "";
      let finalBranchNumber = (record.branchNumber != null && record.branchNumber !== "") ? Number(record.branchNumber) : null;
      let sourceDispatchId = options.sourceDispatchId || record.sourceDispatchId || null;
      let sourceBranchNumber = options.sourceBranchNumber || record.sourceBranchNumber || (options.inheritBranchNumber != null ? Number(options.inheritBranchNumber) : null);

      if (!finalCaseNumber) {
        // 新規案件採番
        const counterSnap = await transaction.get(counterRef);
        const currentSeq = (counterSnap.exists() ? (Number(counterSnap.data()?.lastSequence) || 0) : 0);
        const nextSeq = currentSeq + 1;
        finalCaseNumber = "T" + String(nextSeq).padStart(6, "0");
        finalBranchNumber = 1;

        const caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
        transaction.set(counterRef, {
          lastSequence: nextSeq,
          companyId,
          officeId,
          updatedAt: now
        }, { merge: true });

        transaction.set(caseRef, {
          caseType: "container",
          caseNumber: finalCaseNumber,
          companyId,
          officeId,
          shipper: String(record.shipper || "").trim(),
          nextBranch: 2,
          maxBranch: 1,
          inheritedBranches: [],
          createdAt: now,
          updatedAt: now
        });
      } else {
        // 既存案件の維持または引き継ぎ
        const caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
        const caseSnap = await transaction.get(caseRef);
        let caseData = caseSnap.exists() ? (caseSnap.data() || {}) : null;
        let nextBranch = caseData ? (Number(caseData.nextBranch) || 1) : 1;
        let maxBranch = caseData ? (Number(caseData.maxBranch) || 0) : 0;
        let inheritedBranches = Array.isArray(caseData?.inheritedBranches) ? caseData.inheritedBranches.slice() : [];

        // 枝番未定（新規枝番追加または指定枝番の引継ぎ）
        if (finalBranchNumber == null) {
          if (options.inheritBranchNumber != null && options.inheritBranchNumber !== "") {
            // 引継ぎ指定
            finalBranchNumber = Number(options.inheritBranchNumber);

            // 排他チェック：すでにコンテナ配車へ引き継ぎ済みか検証
            if (inheritedBranches.includes(finalBranchNumber)) {
              throw new Error(`案件 ${finalCaseNumber} の枝番 ${finalBranchNumber} はすでにコンテナ配車へ引継ぎ済みです。`);
            }

            // 引継ぎ元先行配車レコードの存在・案件番号・枝番の正当性を検証
            if (sourceDispatchId) {
              const sourceRef = doc(firestoreDb, `${dispatchRecordsColPath}/${sourceDispatchId}`);
              const sourceSnap = await transaction.get(sourceRef);
              if (!sourceSnap.exists()) {
                throw new Error("引継ぎ元の先行配車データが見つかりません。");
              }
              const sourceData = sourceSnap.data() || {};
              if (sourceData.caseNumber !== finalCaseNumber) {
                throw new Error("引継ぎ元データの案件番号が一致しません。");
              }
              const assigns = Array.isArray(sourceData.assignments) && sourceData.assignments.length
                ? sourceData.assignments
                : [{ branchNumber: sourceData.branchNumber || 1 }];
              const countNum = Math.max(1, parseInt(String(sourceData.count || "1").replace(/[^0-9]/g, ""), 10) || 1);
              if (assigns.length > 1 || countNum > 1) {
                throw new Error("複数台の一般物案件から1台のみを引き継ぐことはできません。単一配車のみ引継ぎ可能です。");
              }

              const hasBranch = assigns.some((a, idx) => {
                const b = a.branchNumber != null ? Number(a.branchNumber) : (idx + 1);
                return b === finalBranchNumber;
              });
              if (!hasBranch) {
                throw new Error(`引継ぎ元データに枝番 ${finalBranchNumber} の割当が存在しません。`);
              }
            }

            // 引き継ぎ済みリストに追加
            inheritedBranches.push(finalBranchNumber);
            maxBranch = Math.max(maxBranch, finalBranchNumber);
            nextBranch = Math.max(nextBranch, finalBranchNumber + 1);
          } else {
            // 新規枝番発行（新工程追加）
            finalBranchNumber = nextBranch;
            nextBranch++;
            maxBranch = Math.max(maxBranch, finalBranchNumber);
          }
        }

        const casePayload = {
          caseType: "container",
          caseNumber: finalCaseNumber,
          companyId,
          officeId,
          shipper: String(record.shipper || caseData?.shipper || "").trim(),
          nextBranch,
          maxBranch,
          inheritedBranches,
          updatedAt: now
        };
        if (!caseData) casePayload.createdAt = now;
        transaction.set(caseRef, casePayload, { merge: true });
      }

      const savedData = cleanUndefined({
        ...record,
        ...boardMetadata(record,options.boardStatus||"master"),
        id: recordId,
        caseNumber: finalCaseNumber,
        branchNumber: finalBranchNumber,
        sourceDispatchId: sourceDispatchId || null,
        sourceBranchNumber: sourceBranchNumber || null,
        companyId,
        officeId,
        cloudUpdatedAt: now
      });

      transaction.set(recordRef, savedData);
      return savedData;
    });
  }

  /**
   * 一般物・先行配車の工程別保存トランザクションコア（①引取り／②荷下ろし × 複数台）
   * 1レコード = 1台（vehicleSlot）× 1工程（stageNo）。台数の割当と工程を別管理し、
   * 同じ親案件番号を維持しながら工程の配車ごとに枝番を発行する。
   */
  async function saveDispatchGeneralStagesCore({
    firestoreDb,
    runTransaction,
    doc,
    companyId,
    officeId,
    caseInfo,
    stages = [],
    options = {}
  }) {
    if (!companyId || !officeId) throw new Error("companyId and officeId are required.");
    if (!Array.isArray(stages) || stages.length === 0) {
      throw new Error("少なくとも1つの工程を選択してください。");
    }
    caseInfo=caseInfo||{};
    const slots=new Set();
    const recordIds=stages.map(st=>String(st.id||newStageId('disp')));
    for(const st of stages){
      if(![1,2].includes(Number(st.stageNo)) || !Number.isInteger(Number(st.vehicleSlot)) || Number(st.vehicleSlot)<1) throw new Error("工程・台数枠・日付を確認してください。");
      validateDispatchDates(st.date, st.arrivalDate);
      if(st.workType!=null && !(Number(st.stageNo)===1?["集配","引取","配達"]:["集荷","配達"]).includes(st.workType)) throw new Error("作業内容を確認してください。");
      if(st.arrivalDate && !/^\d{4}-\d{2}-\d{2}$/.test(String(st.arrivalDate))) throw new Error("着日を確認してください。");
      const key=`${st.vehicleSlot}:${st.stageNo}`;
      if(slots.has(key)) throw new Error("同じ車両枠の同じ工程を重複登録できません。");
      slots.add(key);
    }
    const now = new Date().toISOString();

    const counterPath = `companies/${companyId}/offices/${officeId}/counters/cases`;
    const casesColPath = `companies/${companyId}/offices/${officeId}/cases`;
    const dispatchRecordsColPath = `companies/${companyId}/offices/${officeId}/dispatchRecords`;
    const counterRef = doc(firestoreDb, counterPath);

    return await runTransaction(firestoreDb, async (transaction) => {
      let finalCaseNumber = caseInfo.caseNumber || options.targetCaseNumber || "";
      let caseRef = null;
      let caseSnap = null;
      let nextBranch = 1;
      let maxBranch = 0;
      let newCounterSeq = null; // 新規採番時のみ設定。全読取完了後にまとめて書き込む

      if (!finalCaseNumber) {
        const counterSnap = await transaction.get(counterRef);
        const currentSeq = (counterSnap.exists() ? (Number(counterSnap.data()?.lastSequence) || 0) : 0);
        newCounterSeq = currentSeq + 1;
        finalCaseNumber = "T" + String(newCounterSeq).padStart(6, "0");
        caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
      } else {
        caseRef = doc(firestoreDb, `${casesColPath}/${finalCaseNumber}`);
        caseSnap = await transaction.get(caseRef);
        if (caseSnap.exists()) {
          const caseData = caseSnap.data() || {};
          if(caseData.caseType==="container" || caseData.containerNumber) throw new Error("海コン案件に一般物の工程は追加できません。");
          nextBranch = Number(caseData.nextBranch) || 1;
          maxBranch = Number(caseData.maxBranch) || 0;
        }
      }

      const existingStageData=new Map();
      const seenIds=new Set();
      const seenBranches=new Set();
      for(const st of stages){
        if(st.id){
          if(seenIds.has(String(st.id))) throw new Error("工程IDが重複しています。");
          seenIds.add(String(st.id));
          const existing=await transaction.get(doc(firestoreDb,`${dispatchRecordsColPath}/${st.id}`));
          if(!existing.exists()) throw new Error("編集中の工程が削除されています。再読込してください。");
          const data=existing.data();
          existingStageData.set(String(st.id),data);
          if(data.caseNumber!==finalCaseNumber || Number(data.branchNumber)!==Number(st.branchNumber) || Number(data.stageNo)!==Number(st.stageNo) || Number(data.vehicleSlot)!==Number(st.vehicleSlot)) throw new Error("工程の案件番号・枝番・車両枠は変更できません。");
        }else if(st.branchNumber!=null && st.branchNumber!=="") throw new Error("新規工程には既存の枝番を指定できません。");
        if(st.branchNumber!=null && st.branchNumber!==""){
          if(seenBranches.has(Number(st.branchNumber))) throw new Error("枝番が重複しています。");
          seenBranches.add(Number(st.branchNumber));
        }
      }
      const reserved=await reserveStageSlots({transaction,doc,firestoreDb,recordsPath:dispatchRecordsColPath,caseNumber:finalCaseNumber,caseData:caseSnap?.exists()?caseSnap.data():null,stages,recordIds,otherIds:options.otherExistingStageIds,kind:'general'});
      // nextBranch が過去の不整合で先行していても、履歴上の最大枝番 + 1 から発行する。
      // 削除済み枝番は maxBranch に残るため再利用されない。
      nextBranch=maxBranch+1;
      // 枝番割り当て：既存の枝番を持つ工程はそのまま維持し、新規の工程だけ新しい枝番を発行する
      const sortedStages = stages.slice().sort((a, b) => {
        const slotDiff = (Number(a.vehicleSlot) || 0) - (Number(b.vehicleSlot) || 0);
        if (slotDiff !== 0) return slotDiff;
        return (Number(a.stageNo) || 0) - (Number(b.stageNo) || 0);
      });
      const processedStages = [];
      for (const st of sortedStages) {
        let branch = (st.branchNumber != null && st.branchNumber !== "") ? Number(st.branchNumber) : null;
        if (branch == null) {
          branch = nextBranch;
          nextBranch++;
        }
        maxBranch = Math.max(maxBranch, branch);
        processedStages.push({ ...st, branchNumber: branch });
      }

      nextBranch=Math.max(nextBranch,maxBranch+1);
      if (newCounterSeq != null) {
        transaction.set(counterRef, {
          lastSequence: newCounterSeq,
          companyId,
          officeId,
          updatedAt: now
        }, { merge: true });
      }

      const casePayload = {
        caseNumber: finalCaseNumber,
        caseType: "general",
        stageRecordIds:reserved.registry,
        companyId,
        officeId,
        shipper: String(caseInfo.shipper || "").trim(),
        nextBranch,
        maxBranch,
        updatedAt: now,
        ...(caseSnap && caseSnap.exists() ? {} : { createdAt: now })
      };
      transaction.set(caseRef, casePayload, { merge: true });

      // 各工程レコードの保存（loadPlace/unloadPlace/vehicleNo/driver等、既存の一般物フィールド名を踏襲し
      // assignments配列は持たせないことで、既存の表示・編集・削除・マスター集計ロジックと互換性を保つ）
      const savedStageRecords = [];
      for (const st of processedStages) {
        const recordId = recordIds[stages.findIndex(source=>Number(source.vehicleSlot)===Number(st.vehicleSlot) && Number(source.stageNo)===Number(st.stageNo))];
        const recordRef = doc(firestoreDb, `${dispatchRecordsColPath}/${recordId}`);
        const stageName = st.workType || st.stageName || (Number(st.stageNo) === 1 ? "集配" : "配達");

        const recordPayload = cleanUndefined({
          ...boardMetadata({...st,arrivalDate:st.arrivalDate!=null?st.arrivalDate:(existingStageData.get(String(st.id))?.arrivalDate??""),boardStatus:effectiveBoard({...st,boardStatus:existingStageData.get(String(st.id))?.boardStatus||options.boardStatus||"master"},options.today||japanDateKey())}),
          id: recordId,
          caseNumber: finalCaseNumber,
          branchNumber: st.branchNumber,
          vehicleSlot: Number(st.vehicleSlot) || 1,
          stageNo: Number(st.stageNo),
          stageName,
          workType: stageName,
          date: st.date,
          arrivalDate: st.arrivalDate != null ? st.arrivalDate : (existingStageData.get(String(st.id))?.arrivalDate ?? ""),
          loadPlace: st.origin || "",
          unloadPlace: st.destination || "",
          vehicleNo: st.vehicleNumber || "",
          chassisNumber: st.chassisNumber || "",
          driver: st.driverName || "",
          time: st.time || "",
          note: st.note || "",
          shipper: String(caseInfo.shipper || "").trim(),
          item: String(caseInfo.item || "").trim(),
          vehicleType: String(caseInfo.vehicleType || "").trim(),
          count: String(caseInfo.count || "1台"),
          companyId,
          officeId,
          cloudUpdatedAt: now
        });

        transaction.set(recordRef, recordPayload);
        savedStageRecords.push(recordPayload);
      }

      // 同じ案件の他の既存工程があれば、荷主・品名・車種・台数などの共通情報を同期
      if (Array.isArray(options.otherExistingStageIds) && options.otherExistingStageIds.length > 0) {
        for (const otherId of options.otherExistingStageIds) {
          const otherRef = doc(firestoreDb, `${dispatchRecordsColPath}/${otherId}`);
          transaction.set(otherRef, cleanUndefined({
            shipper: String(caseInfo.shipper || "").trim(),
            item: String(caseInfo.item || "").trim(),
            vehicleType: String(caseInfo.vehicleType || "").trim(),
            count: String(caseInfo.count || "1台"),
            cloudUpdatedAt: now
          }), { merge: true });
        }
      }

      return {
        caseNumber: finalCaseNumber,
        caseInfo: casePayload,
        stages: savedStageRecords
      };
    });
  }

  /**
   * 配車マスター等で先行配車の特定枝番の割当のみを更新し、他の割当を維持するヘルパー
   */
  function updateDispatchRecordAssignmentCore(previousRecord, targetBranchNumber, updates) {
    if (!previousRecord) return null;

    // 新形式（工程別レコード：1レコード=1台×1工程）は assignments 配列を持たないため、
    // このレコード自体を直接更新する（他レコードの台数・工程には触れない）。
    if (previousRecord.stageNo != null) {
      return {
        ...previousRecord,
        date: updates.date || previousRecord.date || "",
        arrivalDate: updates.arrivalDate != null ? updates.arrivalDate : (previousRecord.arrivalDate ?? ""),
        shipper: updates.shipper != null ? updates.shipper : (previousRecord.shipper || ""),
        loadPlace: updates.loadPlace != null ? updates.loadPlace : (previousRecord.loadPlace || ""),
        unloadPlace: updates.unloadPlace != null ? updates.unloadPlace : (previousRecord.unloadPlace || ""),
        item: updates.item != null ? updates.item : (previousRecord.item || ""),
        vehicleType: updates.vehicleType || previousRecord.vehicleType || "",
        note: updates.note != null ? updates.note : (previousRecord.note || ""),
        vehicleNo: updates.vehicleNumber != null ? updates.vehicleNumber : (previousRecord.vehicleNo || ""),
        driver: updates.driverName != null ? updates.driverName : (previousRecord.driver || "")
      };
    }

    let rawAssigns = Array.isArray(previousRecord.assignments) && previousRecord.assignments.length
      ? previousRecord.assignments.map(a => ({ ...a }))
      : [{
          vehicleNumber: previousRecord.vehicleNo || "",
          driverName: previousRecord.driver || "",
          branchNumber: previousRecord.branchNumber || 1
        }];

    let targetBranch = targetBranchNumber != null ? Number(targetBranchNumber) : null;
    let matched = false;

    rawAssigns = rawAssigns.map((a, idx) => {
      const b = a.branchNumber != null ? Number(a.branchNumber) : (idx + 1);
      if (targetBranch != null && b === targetBranch) {
        matched = true;
        return {
          ...a,
          branchNumber: b,
          vehicleNumber: updates.vehicleNumber != null ? updates.vehicleNumber : a.vehicleNumber,
          driverName: updates.driverName != null ? updates.driverName : a.driverName
        };
      }
      return a;
    });

    if (!matched && rawAssigns.length > 0) {
      rawAssigns[0] = {
        ...rawAssigns[0],
        vehicleNumber: updates.vehicleNumber != null ? updates.vehicleNumber : rawAssigns[0].vehicleNumber,
        driverName: updates.driverName != null ? updates.driverName : rawAssigns[0].driverName
      };
    }

    return {
      ...previousRecord,
      date: updates.date || previousRecord.date || "",
      arrivalDate: updates.arrivalDate || previousRecord.arrivalDate || previousRecord.date || "",
      shipper: updates.shipper != null ? updates.shipper : (previousRecord.shipper || ""),
      loadPlace: updates.loadPlace != null ? updates.loadPlace : (previousRecord.loadPlace || ""),
      unloadPlace: updates.unloadPlace != null ? updates.unloadPlace : (previousRecord.unloadPlace || ""),
      arrivalTime: updates.arrivalTime != null ? updates.arrivalTime : (previousRecord.arrivalTime || ""),
      item: updates.item != null ? updates.item : (previousRecord.item || ""),
      vehicleType: updates.vehicleType || previousRecord.vehicleType || "",
      workType: updates.workType != null ? updates.workType : (previousRecord.workType || ""),
      note: updates.note != null ? updates.note : (previousRecord.note || ""),
      count: `${rawAssigns.length}台`,
      assignments: rawAssigns,
      vehicleNo: rawAssigns[0]?.vehicleNumber || "",
      driver: rawAssigns[0]?.driverName || "",
      branchNumber: previousRecord.branchNumber != null ? previousRecord.branchNumber : 1
    };
  }

  /**
   * 配車マスター等で先行配車の特定枝番の割当のみを削除するヘルパー
   * 全割当が削除される場合は shouldDelete: true を返す
   */
  function removeDispatchRecordAssignmentCore(previousRecord, targetBranchNumber) {
    if (!previousRecord) return { shouldDelete: false, updatedRecord: null };

    // 新形式（工程別レコード）は常に1台×1工程＝1レコードなので、対象枝番が一致すれば
    // レコードごと削除。不一致（通常発生しない想定）の場合は何も変更せず据え置く。
    if (previousRecord.stageNo != null) {
      const ownBranch = previousRecord.branchNumber != null ? Number(previousRecord.branchNumber) : null;
      const targetBranch = targetBranchNumber != null ? Number(targetBranchNumber) : null;
      if (targetBranch == null || ownBranch === targetBranch) {
        return { shouldDelete: true, updatedRecord: null };
      }
      return { shouldDelete: false, updatedRecord: previousRecord };
    }

    let rawAssigns = Array.isArray(previousRecord.assignments) && previousRecord.assignments.length
      ? previousRecord.assignments.map(a => ({ ...a }))
      : [{
          vehicleNumber: previousRecord.vehicleNo || "",
          driverName: previousRecord.driver || "",
          branchNumber: previousRecord.branchNumber || 1
        }];

    let targetBranch = targetBranchNumber != null ? Number(targetBranchNumber) : null;
    const remaining = rawAssigns.filter((a, idx) => {
      const b = a.branchNumber != null ? Number(a.branchNumber) : (idx + 1);
      return targetBranch == null || b !== targetBranch;
    });

    if (remaining.length === 0) {
      return { shouldDelete: true, updatedRecord: null };
    }

    const updatedRecord = {
      ...previousRecord,
      assignments: remaining,
      count: `${remaining.length}台`,
      vehicleNo: remaining[0]?.vehicleNumber || "",
      driver: remaining[0]?.driverName || "",
      branchNumber: previousRecord.branchNumber != null ? previousRecord.branchNumber : 1
    };

    return { shouldDelete: false, updatedRecord };
  }

  return {
    japanDateKey,nextDate,dispatchEndDate,effectiveBoard,boardMetadata,moveDispatchToMasterCore,
    saveDispatchRecordCore,
    saveContainerDispatchRecordCore,
      saveContainerCaseStagesCore,
    saveDispatchGeneralStagesCore,
    updateDispatchRecordAssignmentCore,
    removeDispatchRecordAssignmentCore
  };
}));
