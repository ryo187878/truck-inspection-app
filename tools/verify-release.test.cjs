const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const {build,japanDateKey}=require('../today-vehicle-status.js');
const svc=require('../dispatch-service.js');
const today='2026-10-01';
const vehicles=[{name:'水戸 100 あ 1234',_cloudId:'A'},{name:'水戸 100 い 5678',_cloudId:'B'},{name:'水戸 100 う 9999',_cloudId:'C'},{name:'水戸 100 え 7777',_cloudId:'D'}];
const base={vehicles,today,companyId:'company-a',officeId:'office-main'};
function names(values){return values.map(v=>v._cloudId);}
test('点検済み・配車あり未点検・配車なしを正しく照合する',()=>{
 const r=build({...base,inspections:[{date:today,vehicle:vehicles[0].name},{date:today,vehicle:vehicles[2].name}],dispatches:[{date:today,vehicleNo:vehicles[0].name},{date:today,vehicleNo:vehicles[1].name}]});
 assert.deepEqual(names(r.inspected),['A','C']);assert.deepEqual(names(r.uninspected),['B']);assert.deepEqual(names(r.noDispatch),['C','D']);assert.equal(r.assignedCount,2);
});
test('複数台割当・海コン工程・同日複数工程を合算して重複台数を数えない',()=>{
 const r=build({...base,dispatches:[{date:today,assignments:[{vehicleNumber:vehicles[0].name},{vehicleNumber:vehicles[1].name}]},{date:today,vehicleNo:vehicles[0].name}],containers:[{date:today,vehicleNumber:vehicles[1].name},{date:today,vehicleNumber:vehicles[2].name}]});
 assert.equal(r.assignedCount,3);assert.deepEqual(names(r.noDispatch),['D']);
});
test('別日・削除済み・他社・他営業所・自社マスターにない車番・シャーシを除外する',()=>{
 const r=build({...base,dispatches:[{date:'2026-10-02',vehicleNo:vehicles[0].name},{date:today,vehicleNo:vehicles[1].name,deletedAt:'now'},{date:today,vehicleNo:vehicles[2].name,companyId:'other'},{date:today,vehicleNo:vehicles[3].name,officeId:'other'}],containers:[{date:today,vehicleNumber:'外注車 1234',chassisNumber:vehicles[0].name}]});
 assert.equal(r.assignedCount,0);assert.equal(r.noDispatch.length,4);
});
test('全角・空白の表記差を吸収し、ナンバー下4桁だけでは照合しない',()=>{
 const r=build({...base,dispatches:[{date:today,vehicleNo:'水戸１００　あ１２３４'},{date:today,vehicleNo:'1234'}]});assert.deepEqual(names(r.uninspected),['A']);
});
test('車両IDがある場合はIDを優先し、不明なIDを別車両名へフォールバックしない',()=>{
 const r=build({...base,dispatches:[{date:today,vehicleId:'B',vehicleNo:vehicles[0].name},{date:today,vehicleId:'unknown',vehicleNo:vehicles[2].name}]});assert.deepEqual(names(r.uninspected),['B']);
});
test('同じ表示名のマスターが複数ある場合は誤照合しない',()=>{
 const r=build({...base,vehicles:[vehicles[0],{...vehicles[0],_cloudId:'X'}],dispatches:[{date:today,vehicleNo:vehicles[0].name}]});assert.equal(r.assignedCount,0);
});
test('一部枝が引継ぎ済みの旧複数台データは未引継ぎ車両も残す',()=>{
 const r=build({...base,dispatches:[{id:'old',caseNumber:'T1',date:today,assignments:[{vehicleNumber:vehicles[0].name,branchNumber:1},{vehicleNumber:vehicles[1].name,branchNumber:2}]}],containers:[{date:today,sourceDispatchId:'old',sourceBranchNumber:1,caseNumber:'T1',branchNumber:1,vehicleNumber:vehicles[2].name}]});assert.deepEqual(names(r.uninspected),['B','C']);
});
test('日本時間の午前0時で本日が切り替わる',()=>{assert.equal(japanDateKey(new Date('2026-10-01T14:59:59Z')),'2026-10-01');assert.equal(japanDateKey(new Date('2026-10-01T15:00:00Z')),'2026-10-02');});
function database(seed={}){
 const records=structuredClone(seed);
 return {records,doc:(_,p)=>p,firestoreDb:{},runTransaction:async(_,callback)=>{
  let writing=false;const draft=structuredClone(records);
  const result=await callback({get:async p=>{assert.equal(writing,false,'Firestore reads must precede writes');return {exists:()=>p in draft,data:()=>structuredClone(draft[p])};},set:(p,value,opts)=>{writing=true;draft[p]=opts?.merge?{...draft[p],...structuredClone(value)}:structuredClone(value);}});
  Object.keys(records).forEach(k=>delete records[k]);Object.assign(records,draft);return result;
 }};
}
const prefix='companies/company-a/offices/office-main';
const stage=(slot,no,date=today)=>({vehicleSlot:slot,stageNo:no,date,origin:'笠間',destination:'水戸',vehicleNumber:vehicles[slot-1].name,driverName:no===1?'田中':'鈴木',time:'09:15'});
function save(db,caseNumber,stages){return svc.saveDispatchGeneralStagesCore({...db,companyId:'company-a',officeId:'office-main',caseInfo:{caseNumber,shipper:'テスト',item:'荷物',count:'2台'},stages});}
test('一般物2台×2工程を独立した枝で保存し、担当者と日時を維持する',async()=>{
 const db=database();const r=await save(db,'',[stage(1,1),stage(1,2),stage(2,1),stage(2,2,'2026-10-02')]);
 assert.equal(r.caseNumber,'T000001');assert.deepEqual(r.stages.map(s=>s.branchNumber),[1,2,3,4]);assert.deepEqual(r.stages.map(s=>s.driver),['田中','鈴木','田中','鈴木']);assert.equal(r.stages[3].date,'2026-10-02');assert.equal(r.caseInfo.caseType,'general');assert.equal(r.caseInfo.nextBranch,5);
});
test('別日に工程を追加しても親番号が変わらず、削除した枝を再利用しない',async()=>{
 const db=database();const first=await save(db,'',[stage(1,1)]);
 delete db.records[`${prefix}/dispatchRecords/${first.stages[0].id}`];
 const second=await save(db,first.caseNumber,[stage(1,2,'2026-10-02')]);assert.equal(second.stages[0].branchNumber,2);assert.equal(second.caseNumber,first.caseNumber);
});
test('編集時は案件・枝番・車両枠を維持し、時刻と担当者だけ訂正できる',async()=>{
 const db=database();const first=await save(db,'',[stage(1,1)]);const saved=first.stages[0];
 const second=await save(db,first.caseNumber,[{...stage(1,1),id:saved.id,branchNumber:saved.branchNumber,time:'10:45',driverName:'佐藤'}]);assert.equal(second.stages[0].id,saved.id);assert.equal(second.stages[0].branchNumber,1);assert.equal(second.stages[0].time,'10:45');
 const before=structuredClone(db.records);await assert.rejects(save(db,first.caseNumber,[{...stage(1,1),id:saved.id,branchNumber:2}]),/変更できません/);assert.deepEqual(db.records,before);
});
test('海コン親案件に一般物工程を追加しない（型付き・旧形式両対応）',async()=>{
 for(const c of [{caseType:'container'},{containerNumber:'ABCD7654321'}]){
  const db=database({[`${prefix}/cases/T000002`]:{caseNumber:'T000002',nextBranch:4,maxBranch:3,...c}});const before=structuredClone(db.records);await assert.rejects(save(db,'T000002',[stage(1,1)]),/海コン/);assert.deepEqual(db.records,before);
 }
});
test('同一台枠工程・枝番の不正指定・存在しない編集IDを拒否し原子的に保持する',async()=>{
 for(const stages of [[stage(1,1),stage(1,1)],[{...stage(1,1),branchNumber:9}],[{...stage(1,1),id:'deleted',branchNumber:1}]]){
  const db=database();await assert.rejects(save(db,'',stages));assert.deepEqual(db.records,{});
 }
});
test('他案件の工程に共通情報を上書きしない',async()=>{
 const db=database({[`${prefix}/dispatchRecords/other`]:{caseNumber:'T000009'}});
 await assert.rejects(svc.saveDispatchGeneralStagesCore({...db,companyId:'company-a',officeId:'office-main',caseInfo:{},stages:[stage(1,1)],options:{otherExistingStageIds:['other']}}),/同じ案件/);assert.deepEqual(db.records,{[`${prefix}/dispatchRecords/other`]:{caseNumber:'T000009'}});
});
test('両HTMLのJavaScript構文・ID一意性・フォームのautocomplete対策を保持する',()=>{
 for(const file of ['index.html','test/index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  for(const [,attrs,code] of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) if(!attrs.includes('module')) new vm.Script(code);
  const markup=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');
  const ids=[...markup.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length,`Duplicate IDs in ${file}`);
  for(const id of ['masterFormOverlay','dispatchFormOverlay','containerFormOverlay']){
   const start=html.indexOf(`id="${id}"`);assert.match(html.slice(start,start+1500),/<form[^>]*autocomplete="off"[^>]*onsubmit="return false/);
  }
  assert.ok(html.includes('id="todayNoDispatchVehicles"'));assert.ok(html.includes('where("date","==",date)'));
 }
});
test('正式版の本番Firebase・QR印刷・点検保存画面を保持し、testはエミュレータ専用',()=>{
 const main=fs.readFileSync(path.join(root,'index.html'),'utf8'),testHtml=fs.readFileSync(path.join(root,'test/index.html'),'utf8');
 assert.ok(main.includes('truck-inspection-app-6a0c8'));assert.ok(main.includes('id="installPage"'));assert.ok(main.includes('@media print'));assert.ok(main.includes('managerConfirmedAt'));assert.ok(testHtml.includes('tramo-browser-test'));assert.ok(!testHtml.includes('truck-inspection-app-6a0c8'));
});
function htmlHarness(file){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 const elements=new Map();
 class Element {
  constructor(id,tag='input'){this.id=id;this.tagName=tag.toUpperCase();this.value='';this.checked=false;this.disabled=false;this.style={};this.options=[];this.textContent='';this._html='';}
  set innerHTML(value){
   this._html=value;
   this.options=[...value.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(m=>({value:/value="([^"]*)"/.exec(m[1])?.[1]||'',selected:/\bselected\b/.test(m[1]),textContent:m[2]}));
   if(this.tagName==='SELECT') this.value=(this.options.find(o=>o.selected)||this.options[0])?.value||'';
   parse(value);
  }
  get innerHTML(){return this._html;}
  addEventListener(){}
  getAttribute(name){return this[name]??null;}
 }
 function parse(markup){
  for(const m of markup.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){
   const element=new Element(m[3],m[1]),attrs=m[2];
   element.value=/\bvalue="([^"]*)"/.exec(attrs)?.[1]||'';element.checked=/\bchecked\b/.test(attrs);element.disabled=/\bdisabled\b/.test(attrs);elements.set(m[3],element);
  }
 }
 parse(html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,''));
 const masterVehicles=structuredClone(vehicles);
 const context=vm.createContext({console,Date,Intl,crypto:require('node:crypto').webcrypto,setTimeout,clearTimeout,
  document:{getElementById:id=>elements.get(id)||null,querySelectorAll:()=>[]},
  window:{TodayVehicleStatus:{...require('../today-vehicle-status.js'),japanDateKey:()=>today},TramoYamatoDaily:require('../yamato-daily.js'),firebaseProfile:{role:'admin'},firebaseReady:true,confirm:()=>true,firebaseCloud:{}},
  localDateKey:()=>today,escapeHtml:v=>String(v??''),escapeAttr:v=>String(v??''),getMaster:key=>key==='truck_vehicles'?masterVehicles:['田中','鈴木','佐藤'],defaultVehicles:[],defaultDrivers:[],alert:message=>{throw new Error(message);},renderMasters:()=>{},TodayVehicleStatus:{...require('../today-vehicle-status.js'),japanDateKey:()=>today}
 });
 const start=html.indexOf('// ===== 荷主ごとの表示グルーピング');const end=html.indexOf('function renderRecords(',start);
 vm.runInContext(html.slice(start,end),context);
 return {context,elements,run:code=>vm.runInContext(code,context),html};
}
test('正式版とtestでマスター新規登録が2工程入力へつながり、海コン案件を候補から除く',()=>{
 for(const f of ['index.html','test/index.html']){
  const h=htmlHarness(f);
  h.run(`caseRecords=[{caseNumber:'T000002',containerNumber:'ABCD7654321'},{caseNumber:'T000005',shipper:'一般荷主'}];containerDispatchRecords=[{caseNumber:'T000003'}];masterAddNew();masterCreateStages('general');`);
  assert.equal(h.elements.get('dispatchFormOverlay').style.display,'flex');assert.equal(h.run('dispatchSlotDraft.length'),1);
  assert.ok(h.elements.get('dispatchFormCaseSelect').innerHTML.includes('T000005'));assert.ok(!h.elements.get('dispatchFormCaseSelect').innerHTML.includes('T000002'));
  h.elements.get('dispatchSlotCheck_1_1').checked=true;h.run('dispatchToggleSlotStage(1,1)');
  assert.equal(h.run('dispatchSlotDraft[0].stage1.checked'),true);
  h.elements.get('dispatchSlotOrigin_1_1').value='笠間';h.elements.get('dispatchSlotTime_1_1').value='09:15';h.elements.get('dispatchFormCount').value='2';h.run('dispatchOnFormCountChanged()');
  assert.equal(h.elements.get('dispatchSlotOrigin_1_1').value,'笠間');assert.equal(h.run('dispatchSlotDraft.length'),2);assert.equal(h.elements.get('dispatchSlotTime_1_1').value,'09:15');
 }
});
test('マスター表示・Excelに枝ごとの引取り／荷下ろし・着日・時刻・シャーシが出る',()=>{
 for(const f of ['index.html','test/index.html']){
  const h=htmlHarness(f);
  h.run(`dispatchRecords=[{id:'g1',caseNumber:'T000004',branchNumber:1,stageNo:1,vehicleSlot:1,date:'2026-10-01',vehicleNo:'車A',driver:'田中',workType:'引取り',time:'09:15'},{id:'g2',caseNumber:'T000004',branchNumber:2,stageNo:2,vehicleSlot:1,date:'2026-10-02',vehicleNo:'車A',driver:'鈴木',workType:'荷下ろし',time:'10:45'}];containerDispatchRecords=[{id:'c1',caseNumber:'T000002',branchNumber:1,date:'2026-10-01',chassisNumber:'5678',containerNumber:'ABCD7654321',time:'08:00'}];masterCurrentMonth='2026-10';renderDispatchMaster();`);
  const rows=JSON.parse(h.run('JSON.stringify(masterBuildRows().map(masterRowToExcelRow))'));
  assert.deepEqual(rows.map(r=>r[1]),['T000002-1','T000004-1','T000004-2']);assert.equal(rows[0][10],'5678');assert.equal(rows[1][12],'引取り');assert.equal(rows[2][12],'荷下ろし');assert.equal(rows[1][14],'09:15');assert.equal(rows[2][6],'2026-10-02');
  assert.ok(h.elements.get('masterTableBody').innerHTML.includes('09:15'));
  h.run(`masterEditRow(masterLastRenderedRows.findIndex(r=>r.record.id==='g1'))`);
  assert.equal(h.elements.get('dispatchSlotTime_1_1').value,'09:15');assert.equal(h.elements.get('dispatchFormDeleteStageBtn').style.display,'');assert.equal(h.elements.get('dispatchSlotDriver_1_2').disabled,true);
 }
});
test('旧形式の複数割当は枝単位の表示を保ち、従来の編集フォームを使う',()=>{
 const h=htmlHarness('index.html');
 h.run(`dispatchRecords=[{id:'old',caseNumber:'T000007',branchNumber:1,date:'2026-10-01',count:'2台',assignments:[{branchNumber:1,vehicleNumber:'車A',driverName:'田中'},{branchNumber:2,vehicleNumber:'車B',driverName:'鈴木'}]}];masterCurrentMonth='2026-10';renderDispatchMaster();masterEditRow(1);`);
 assert.equal(h.run('masterBuildRows().length'),2);assert.equal(h.run('masterEditingTargetBranch'),2);assert.equal(h.elements.get('masterFormOverlay').style.display,'flex');assert.equal(h.elements.get('masterFormDriverName').value,'鈴木');
});
test('読み込み失敗は配車なしと誤表示せず、照合UIは3つの一覧を表示する',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const helper=html.slice(html.indexOf('function renderTodayVehicleLists(){'),html.indexOf('function renderMasters(){'));
 const h=htmlHarness('index.html');vm.runInContext(helper,h.context);
 h.run('window.todayVehicleCloudState={error:true,ready:{}};renderTodayVehicleLists()');
 assert.equal(h.elements.get('todayNoDispatchCount').textContent,'　確認できません');
 h.run(`window.todayVehicleCloudState={date:'2026-10-01',companyId:'company-a',officeId:'office-main',ready:{inspections:true,dispatches:true,containers:true},inspections:[{date:'2026-10-01',vehicle:'水戸 100 あ 1234'}],dispatches:[{date:'2026-10-01',vehicleNo:'水戸 100 い 5678'}],containers:[]};renderTodayVehicleLists()`);
 assert.match(h.elements.get('todayNoInspectionCount').textContent,/1 \/ 4台/);assert.match(h.elements.get('todayNoInspectionVehicles').innerHTML,/5678/);assert.match(h.elements.get('todayNoDispatchVehicles').innerHTML,/9999/);assert.match(h.elements.get('todayNoDispatchVehicles').innerHTML,/1234/);
});
test('リアルタイム照合は本日の会社パスのみ購読し、ログアウト時に全購読を解放する',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const watcher=html.slice(html.indexOf('  // Listen only'),html.indexOf('async function syncAfterLogin',html.indexOf('  // Listen only')));
 let canceled=0;const calls=[];let renders=0;
 const context=vm.createContext({console,window:{firebaseReady:true,firebaseProfile:{role:'admin'}},TodayVehicleStatus:{...require('../today-vehicle-status.js'),japanDateKey:()=>today},CLOUD_COMPANY:'company-a',CLOUD_OFFICE:'office-main',CLOUD_COLLECTION:'companies/company-a/offices/office-main/inspections',CLOUD_DISPATCH_COLLECTION:'companies/company-a/offices/office-main/dispatchRecords',CLOUD_CONTAINER_DISPATCH_COLLECTION:'companies/company-a/offices/office-main/containerDispatchRecords',firestoreDb:{},collection:(_,path)=>path,where:(...args)=>args,query:(...args)=>args,onSnapshot:(q,opts,onData,onError)=>{calls.push({q,onData,onError});return ()=>canceled++;},setInterval:()=>1,clearInterval:()=>{},renderTodayVehicleLists:()=>renders++});
 vm.runInContext(watcher,context);vm.runInContext('startTodayVehicleWatch()',context);
 assert.equal(calls.length,6);calls.forEach((c,i)=>{assert.ok(c.q[0].startsWith('companies/company-a/offices/office-main/'));assert.equal(c.q[1][0],i===0?'date':'boardQueryKey');assert.equal(c.q[1][1],i===0?'==':'>=');c.onData({docs:(i===3||i===5)?[{id:"legacy",data:()=>({date:today,vehicleNo:vehicles[0].name,vehicleNumber:vehicles[1].name})}]:[],metadata:{fromCache:false}});});
 assert.equal(context.window.todayVehicleCloudState.ready.containers,true);
 assert.equal(context.window.todayVehicleCloudState.dispatches.length,1);assert.equal(context.window.todayVehicleCloudState.containers.length,1);
 assert.equal(context.window.todayVehicleCloudState.ready.dispatches,true);
 const stale=calls[0].onData;vm.runInContext('stopTodayVehicleWatch()',context);assert.equal(canceled,6);stale({docs:[],metadata:{fromCache:false}});assert.equal(context.window.todayVehicleCloudState,null);assert.ok(renders>0);
});
test('既存の別工程は入力無効に保ち、対象工程を保存しても担当者・時刻を上書きしない',async()=>{
 const h=htmlHarness('index.html');
 const original=[{id:'g1',caseNumber:'T000004',branchNumber:1,stageNo:1,vehicleSlot:1,date:today,vehicleNo:vehicles[0].name,driver:'田中',workType:'引取り',time:'09:15',count:'1台'},{id:'g2',caseNumber:'T000004',branchNumber:2,stageNo:2,vehicleSlot:1,date:'2026-10-02',vehicleNo:vehicles[0].name,driver:'鈴木',workType:'荷下ろし',time:'10:45',count:'1台'}];
 h.run(`dispatchRecords=${JSON.stringify(original)};masterCurrentMonth='2026-10';renderDispatchMaster();masterEditRow(0);`);
 let saved;h.context.window.firebaseCloud.saveDispatchGeneralStages=async(info,stages,options)=>{saved={info,stages,options};return {caseNumber:'T000004',stages:stages.map(st=>({...original[0],time:st.time}))};};
 h.elements.get('dispatchSlotTime_1_1').value='09:30';h.elements.get('dispatchFormShipper').value='訂正荷主';h.elements.get('dispatchFormItem').value='品名';h.elements.get('dispatchFormVehicleType').value='4t平';
 await h.run('dispatchSubmitStageForm()');
 assert.equal(saved.stages.length,1);assert.equal(saved.stages[0].id,'g1');assert.deepEqual(Array.from(saved.options.otherExistingStageIds),['g2']);
 assert.equal(h.run('dispatchRecords.find(r=>r.id==="g2").driver'),'鈴木');assert.equal(h.run('dispatchRecords.find(r=>r.id==="g2").time'),'10:45');assert.equal(h.run('dispatchRecords.find(r=>r.id==="g2").shipper'),'訂正荷主');
});

test('一般・海コン入力画面は非表示になるページの外に置き、マスターからも表示できる',()=>{
 for(const file of ['index.html','test/index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const stack=[];const found=[];
  for(const match of html.matchAll(/<\/?([a-z][a-z0-9]*)\b[^>]*>/gi)){
   const tag=match[1].toLowerCase();
   if(match[0].startsWith('</')){const i=stack.map(e=>e.tag).lastIndexOf(tag);if(i>=0)stack.splice(i);continue;}
   const attrs=match[0];const id=/\bid="([^"]+)"/.exec(attrs)?.[1];
   if(['dispatchFormOverlay','containerFormOverlay'].includes(id)){
    assert.ok(!stack.some(e=>e.page),`${file}: ${id} must not inherit hidden page display`);found.push(id);
   }
   if(!['input','meta','link','br','hr','img','source','wbr','area','base','embed','param','track','col'].includes(tag))stack.push({tag,page:/\bclass="[^"]*\bpage\b/.test(attrs)});
  }
  assert.equal(found.length,2);
 }
});
test('積み地・降ろし地が空欄の一般配車はマスターとExcelでも空欄のまま表示する',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);
  h.run(`dispatchRecords=[{id:'yamato',caseNumber:'T000008',branchNumber:1,stageNo:2,vehicleSlot:1,date:'2026-10-01',shipper:'ヤマト',workType:'荷下ろし'}];masterCurrentMonth='2026-10';renderDispatchMaster();`);
  assert.ok(h.elements.get('masterTableBody').innerHTML.includes('<td class="master-col-route"></td>'));
  const row=JSON.parse(h.run('JSON.stringify(masterRowToExcelRow(masterBuildRows()[0]))'));
  assert.equal(row[4],'');assert.equal(row[5],'');
 }
});

test('一般工程の着日は日付と別に保存され、編集・台数追加・Excelでも保持する',async()=>{
 const db=database();const first=await save(db,'',[{...stage(1,1),arrivalDate:'2026-10-03'},{...stage(1,2,'2026-10-04'),arrivalDate:''}]);
 assert.equal(first.stages[0].arrivalDate,'2026-10-03');assert.equal(first.stages[1].arrivalDate,'');
 const pickup=first.stages[0];
 const edited=await save(db,first.caseNumber,[{...stage(1,1),id:pickup.id,branchNumber:pickup.branchNumber}]);
 assert.equal(edited.stages[0].arrivalDate,'2026-10-03');assert.equal(edited.stages[0].branchNumber,pickup.branchNumber);
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);h.run(`dispatchRecords=${JSON.stringify(first.stages)};masterCurrentMonth='2026-10';renderDispatchMaster();masterEditRow(0);`);
  assert.equal(h.elements.get('dispatchSlotArrivalDate_1_1').value,'2026-10-03');
  h.elements.get('dispatchSlotArrivalDate_1_1').value='2026-10-05';h.elements.get('dispatchFormCount').value='2';h.run('dispatchOnFormCountChanged()');
  assert.equal(h.elements.get('dispatchSlotArrivalDate_1_1').value,'2026-10-05');assert.equal(h.elements.get('dispatchSlotArrivalDate_1_2').disabled,true);
  assert.equal(h.run('masterRowToExcelRow(masterBuildRows()[0])[6]'),'2026-10-03');
 }
});

test('一般工程の着日は両工程とも任意で、空欄を保存・編集・一覧・Excelまで保持する',async()=>{
 const db=database();const result=await save(db,'',[{...stage(1,1),arrivalDate:''},{...stage(1,2),arrivalDate:'2026-10-03'}]);
 assert.equal(result.stages[0].arrivalDate,'');assert.equal(result.stages[1].arrivalDate,'2026-10-03');
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);h.run(`dispatchRecords=${JSON.stringify(result.stages)};masterCurrentMonth='2026-10';renderDispatchMaster();masterEditRow(0);`);
  assert.equal(h.elements.get('dispatchSlotArrivalDate_1_1').value,'');
  assert.equal(h.run('masterRowToExcelRow(masterBuildRows()[0])[6]'),'');
  assert.equal(h.run('masterRowToExcelRow(masterBuildRows()[1])[6]'),'2026-10-03');
  assert.ok(h.elements.get('masterTableBody').innerHTML.includes('<td class="container-col-date"></td>'));
 }
 const drop=result.stages[1];const changed=await save(db,result.caseNumber,[{...stage(1,2),id:drop.id,branchNumber:drop.branchNumber,arrivalDate:''}]);assert.equal(changed.stages[0].arrivalDate,'');
});

test('一般①の作業選択と②配達を保存し、時間の独立と空欄の着日を保持する',async()=>{
 const db=database();
 const r=await save(db,'',[{...stage(1,1),workType:'引取',arrivalDate:'',time:'08:00'},{...stage(1,2),workType:'配達',arrivalDate:'2026-10-03',time:'10:00'}]);
 assert.deepEqual(r.stages.map(s=>s.workType),['引取','配達']);assert.deepEqual(r.stages.map(s=>s.time),['08:00','10:00']);assert.equal(r.stages[0].arrivalDate,'');
 await assert.rejects(save(db,'',[{...stage(1,1),workType:'配達'}]),/作業内容/);
});
test('一般①から②へ連動し、②で変更した時間・乗務員・空欄を再描画後も保持する',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);h.run('dispatchSlotDraft=[dispatchMakeEmptySlot()];dispatchRenderVehicleSlots();');
  const set=(suffix,no,v)=>h.elements.get(`dispatchSlot${suffix}_1_${no}`).value=v;
  assert.equal(h.elements.get('dispatchSlotWorkType_1_1').value,'集配');
  set('Date',1,'2026-10-02');set('ArrivalDate',1,'2026-10-03');set('Destination',1,'青森');set('Origin',1,'笠間');set('Time',1,'09:00');set('Driver',1,'田中');set('Vehicle',1,vehicles[0].name);
  h.run("dispatchOnLinkedField(1,1,'time')");
  assert.equal(h.elements.get('dispatchSlotTime_1_2').value,'09:00');assert.equal(h.elements.get('dispatchSlotDestination_1_2').value,'青森');
  assert.equal(h.elements.get('dispatchSlotDriver_1_2').value,'');assert.equal(h.elements.get('dispatchSlotVehicle_1_2').value,'');
  set('Time',2,'10:00');h.run("dispatchOnLinkedField(1,2,'time')");set('Driver',2,'鈴木');h.run("dispatchOnLinkedField(1,2,'driverName')");set('ArrivalDate',2,'');h.run("dispatchOnLinkedField(1,2,'arrivalDate')");
  h.elements.get('dispatchSlotWorkType_1_1').value='引取';h.run('dispatchCaptureSlotDraftFromDom();dispatchRenderVehicleSlots()');
  set('Time',1,'11:00');set('Driver',1,'佐藤');h.run("dispatchOnLinkedField(1,1,'time')");
  assert.equal(h.elements.get('dispatchSlotTime_1_2').value,'10:00');assert.equal(h.elements.get('dispatchSlotDriver_1_2').value,'鈴木');assert.equal(h.elements.get('dispatchSlotArrivalDate_1_2').value,'');assert.equal(h.elements.get('dispatchSlotWorkType_1_1').value,'引取');
  h.run("dispatchSlotDraft[0].stage2.id='saved'");set('Destination',1,'郡山');h.run("dispatchOnLinkedField(1,1,'destination')");assert.equal(h.elements.get('dispatchSlotDestination_1_2').value,'青森');
 }
});
test('海コンは着地と時間だけ連動し、発地は保持、②時間の訂正と既存工程を上書きしない',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);const e=h.elements;
  e.get('containerStageDestination1').value='笠間';e.get('containerStageTime1').value='09:00';e.get('containerStageOrigin2').value='独立発地';h.run('containerSyncDestinationTime()');
  assert.equal(e.get('containerStageDestination2').value,'笠間');assert.equal(e.get('containerStageTime2').value,'09:00');assert.equal(e.get('containerStageOrigin2').value,'独立発地');
  e.get('containerStageTime2').value='10:00';h.run("containerOnLinkedField(2,'Time')");e.get('containerStageTime1').value='11:00';h.run("containerOnLinkedField(1,'Time')");assert.equal(e.get('containerStageTime2').value,'10:00');
  h.run("containerExistingStageIds={2:'saved'}");e.get('containerStageDestination1').value='青森';h.run('containerSyncDestinationTime()');assert.equal(e.get('containerStageDestination2').value,'笠間');
  e.get('containerFormChassisNumber').value='005678';h.run('containerSyncChassis()');for(const n of [1,2,3]) assert.equal(e.get(`containerStageChassis${n}`).value,'005678');
 }
});
test('海コン共通シャーシは全工程で一致し、訂正と後からの工程追加に引き継ぐ',async()=>{
 const db=database();const saveC=(caseInfo,stages,options={})=>svc.saveContainerCaseStagesCore({...db,companyId:'company-a',officeId:'office-main',caseInfo,stages,options});
 const cstage=n=>({stageNo:n,date:today,content:n===1?'実入り搬出':n===2?'デバン':'空バン返却',chassisNumber:'ignored',time:`0${n}:00`,origin:'本牧',destination:'笠間'});
 const first=await saveC({shipper:'テスト',chassisNumber:'005678'},[cstage(1),cstage(2)]);
 assert.deepEqual(first.stages.map(s=>s.chassisNumber),['005678','005678']);
 const edited=await saveC({caseNumber:first.caseNumber,chassisNumber:'009999'},[{...first.stages[0],time:'08:00'}],{otherExistingStageIds:[first.stages[1].id]});
 assert.equal(edited.stages[0].chassisNumber,'009999');const sibling=db.records[`${prefix}/containerDispatchRecords/${first.stages[1].id}`];assert.equal(sibling.chassisNumber,'009999');assert.equal(sibling.time,'02:00');
 const third=await saveC({caseNumber:first.caseNumber},[cstage(3)]);assert.equal(third.stages[0].chassisNumber,'009999');
 const before=structuredClone(db.records);await assert.rejects(saveC({caseNumber:first.caseNumber,chassisNumber:'bad'},[{...first.stages[0]}],{otherExistingStageIds:['missing']}),/同じ案件/);assert.deepEqual(db.records,before);
});

test('先行は前日からマスターになり、直入力のマスターは先行に入らない',()=>{
 const t=require('../today-vehicle-status.js');
 assert.equal(t.effectiveBoard({boardStatus:'advance',date:'2026-10-06'},'2026-10-04'),'advance');
 assert.equal(t.effectiveBoard({boardStatus:'advance',date:'2026-10-06'},'2026-10-05'),'master');
 assert.equal(t.effectiveBoard({boardStatus:'master',date:'2026-10-06'},'2026-10-01'),'master');
 assert.equal(t.effectiveBoard({date:'2026-10-06'},'2026-10-01'),'master');
});
test('当日完結と日をまたぐ配車は終了日の翌日0時に非表示となる',()=>{
 const t=require('../today-vehicle-status.js');
 const one={date:'2026-10-02',arrivalDate:''},two={date:'2026-10-02',arrivalDate:'2026-10-03'};
 assert.equal(t.active(one,'2026-10-02'),true);assert.equal(t.active(one,'2026-10-03'),false);
 assert.equal(t.active(two,'2026-10-03'),true);assert.equal(t.active(two,'2026-10-04'),false);
 assert.equal(t.endDate({date:'2026-10-03',arrivalDate:'2026-10-02'}),'2026-10-03');
});
test('前日から運行中の車両を翌日の未点検に含め、未来の先行車両と終了車両を除く',()=>{
 const r=build({...base,today:'2026-10-03',dispatches:[{date:'2026-10-02',arrivalDate:'2026-10-03',boardStatus:'master',vehicleNo:vehicles[0].name},{date:'2026-10-06',boardStatus:'advance',vehicleNo:vehicles[1].name},{date:'2026-10-02',vehicleNo:vehicles[2].name}],containers:[{date:'2026-10-02',arrivalDate:'2026-10-03',vehicleNumber:vehicles[0].name}]});
 assert.deepEqual(names(r.uninspected),['A','B','C','D']);assert.equal(r.assignedCount,1);assert.deepEqual(names(r.noDispatch),['B','C','D']);
});
test('先行からマスターへ移しても記録ID・採番・枝・担当者を変えず、二重移動しない',async()=>{
 const db=database();const first=await svc.saveDispatchGeneralStagesCore({...db,companyId:'company-a',officeId:'office-main',caseInfo:{shipper:'予定'},stages:[stage(1,1,'2026-10-06')],options:{boardStatus:'advance'}});
 const r=first.stages[0],before=structuredClone(db.records);
 assert.equal(r.boardQueryKey,'advance|2026-10-06');
 const args={...db,companyId:'company-a',officeId:'office-main',recordId:r.id};
 const early=await svc.moveDispatchToMasterCore({...args,today:'2026-10-04'});assert.equal(early.boardStatus,'advance');assert.deepEqual(db.records,before);
 const moved=await svc.moveDispatchToMasterCore({...args,today:'2026-10-05'});assert.equal(moved.boardStatus,'master');assert.equal(moved.boardQueryKey,'master|2026-10-06');
 for(const key of ['id','caseNumber','branchNumber','vehicleSlot','stageNo','driver','vehicleNo','date']) assert.equal(moved[key],r[key]);
 const after=structuredClone(db.records);await svc.moveDispatchToMasterCore({...args,today:'2026-10-05'});assert.deepEqual(db.records,after);
 assert.equal(Object.keys(db.records).length,Object.keys(before).length);assert.deepEqual(db.records[`${prefix}/counters/cases`],before[`${prefix}/counters/cases`]);
});
test('着日訂正で終了日の検索キーが変わり、既存マスターの編集は先行へ戻さない',async()=>{
 const db=database();const first=await save(db,'',[{...stage(1,1),arrivalDate:'2026-10-03'}]);const r=first.stages[0];
 assert.equal(r.boardQueryKey,'master|2026-10-03');
 const edited=await svc.saveDispatchGeneralStagesCore({...db,companyId:'company-a',officeId:'office-main',caseInfo:{caseNumber:first.caseNumber},stages:[{...stage(1,1),id:r.id,branchNumber:r.branchNumber,arrivalDate:'2026-10-04'}],options:{boardStatus:'advance'}});
 assert.equal(edited.stages[0].boardStatus,'master');assert.equal(edited.stages[0].boardQueryKey,'master|2026-10-04');
});
test('他の会社の記録は移動できず、削除済みの移動は新記録を作らない',async()=>{
 const db=database({[`${prefix}/dispatchRecords/bad`]:{companyId:'other',date:'2026-10-06',boardStatus:'advance'}}),before=structuredClone(db.records);
 await assert.rejects(svc.moveDispatchToMasterCore({...db,companyId:'company-a',officeId:'office-main',recordId:'bad',today:'2026-10-05'}),/所属/);
 await assert.rejects(svc.moveDispatchToMasterCore({...db,companyId:'company-a',officeId:'office-main',recordId:'deleted',today:'2026-10-05'}),/削除/);assert.deepEqual(db.records,before);
});
test('通常マスターは終了済みを除き、月をまたいで運行中の記録と前日移動を表示する',()=>{
 const h=htmlHarness('index.html');h.run(`masterCurrentMonth='2026-10';dispatchRecords=[{id:'ended',caseNumber:'T1',date:'2026-09-30'},{id:'carry',caseNumber:'T2',date:'2026-09-30',arrivalDate:'2026-10-02'},{id:'future',caseNumber:'T3',date:'2026-10-06',boardStatus:'advance'},{id:'due',caseNumber:'T4',date:'2026-10-02',boardStatus:'advance'}];`);
 assert.deepEqual(Array.from(h.run('masterBuildRows().map(r=>r.record.id)')),['carry','due']);
});
test('過去検索は追加ページと条件絞込に対応し、通常表示へ戻ると終了済みを除く',async()=>{
 const h=htmlHarness('index.html');
 const fields={masterHistoryFrom:'2026-09-01',masterHistoryTo:'2026-09-30',masterHistoryVehicle:'1234',masterHistoryDriver:'田中',masterHistoryShipper:'ヤマト',masterHistoryCase:'T000010'};
 for(const [id,v] of Object.entries(fields))h.elements.get(id).value=v;
 let count=0;h.context.window.firebaseCloud.loadBoardHistoryPage=async q=>{count++;if(count===2)assert.equal(q.cursors.general,'next');return {general:[{id:'old'+count,caseNumber:'T000010',branchNumber:count,date:'2026-09-20',shipper:'ヤマト',vehicleNo:vehicles[0].name,driver:'田中'}],container:[],cursors:{general:count===1?'next':false,container:false},hasMore:count===1};};
 await h.run('masterSearchHistory()');assert.equal(h.run('masterBuildRows().length'),1);await h.run('masterSearchHistory(true)');assert.equal(h.run('masterBuildRows().length'),2);
 assert.equal(h.elements.get('masterHistoryMore').style.display,'none');h.elements.get('masterHistoryPanel').open=true;h.run('masterExitHistory()');assert.equal(h.run('masterBuildRows().length'),0);assert.equal(h.elements.get('masterHistoryPanel').open,false);assert.ok(!h.elements.get('masterHistoryStatus').textContent.includes('検索結果'));assert.equal(h.elements.get('masterHistoryMore').style.display,'none');
});
test('過去検索の削除は終了済み記録をキャッシュからも消し、他工程を保持する',async()=>{
 const h=htmlHarness('index.html');h.context.window.DispatchService=svc;let deleted;
 h.context.window.firebaseCloud.deleteDispatchRecord=async id=>deleted=id;
 h.run(`masterHistoryMode=true;masterHistoryData={general:[{id:'old',caseNumber:'T000010',branchNumber:1,stageNo:1,vehicleSlot:1,date:'2026-09-20'}],container:[]};renderDispatchMaster();`);
 assert.equal(await h.run('masterDeleteRow(0)'),true);assert.equal(deleted,'old');assert.equal(h.run('masterBuildRows().length'),0);
});

test('旧データは区分を推測せず100件ずつ索引を付け、明示した先行・確定を保持する',async()=>{
 const html=fs.readFileSync(path.join(root,'test/index.html'),'utf8'),records=new Map(),requests=[];
 const general=prefix+'/dispatchRecords',container=prefix+'/containerDispatchRecords';
 for(let i=0;i<105;i++)records.set(general+'/'+String(i).padStart(3,'0'),{date:i===104?'2026-10-02':'2026-09-20',caseNumber:'T'+i});
 records.set(general+'/legacy-future',{date:'2026-10-06',caseNumber:'T106'});
 records.set(general+'/confirmed',{date:'2026-10-06',caseNumber:'T107',boardStatus:'master'});
 records.set(general+'/planned',{date:'2026-10-06',caseNumber:'T108',boardStatus:'advance'});
 for(let i=0;i<105;i++)records.set(container+'/'+String(i).padStart(3,'0'),{date:'2026-09-20',caseNumber:'C'+i});
 const db=database(Object.fromEntries(records));
 const snap=(id,data)=>({id,exists:()=>!!data,data:()=>data});
 const context=vm.createContext({window:{firebaseProfile:{role:'admin'},DispatchService:svc},TodayVehicleStatus:{...require('../today-vehicle-status.js'),japanDateKey:()=>today},CLOUD_COMPANY:'company-a',CLOUD_OFFICE:'office-main',CLOUD_DISPATCH_COLLECTION:general,CLOUD_CONTAINER_DISPATCH_COLLECTION:container,...db,Date,doc:(_,p,id)=>id?p+'/'+id:p,getDoc:async p=>snap(p.split('/').pop(),db.records[p]),setDoc:async(p,v)=>db.records[p]=v,collection:(_,p)=>p,documentId:()=> '__name__',orderBy:k=>['order',k],where:(...a)=>['where',...a],limit:n=>['limit',n],startAfter:d=>['after',d.id],query:(...a)=>a,getDocs:async q=>{
  requests.push(q);let rows=Object.entries(db.records).filter(([p])=>p.startsWith(q[0]+'/')).map(([p,r])=>snap(p.split('/').pop(),r));
  const order=q.find(x=>Array.isArray(x)&&x[0]==='order')?.[1];rows.sort((a,b)=>String(order==='date'?a.data().date:a.id).localeCompare(String(order==='date'?b.data().date:b.id))||a.id.localeCompare(b.id));
  for(const term of q.slice(1)){if(term[0]==='where'){const [,k,op,val]=term;rows=rows.filter(d=>op==='>='?d.data()[k]>=val:op==='<='?d.data()[k]<=val:d.data()[k]===val);}if(term[0]==='after'){const n=rows.findIndex(d=>d.id===term[1]);rows=rows.slice(n+1);}if(term[0]==='limit')rows=rows.slice(0,term[1]);}
  return {docs:rows,size:rows.length,empty:rows.length===0};
 }});
 const a=html.indexOf("  let boardMetadataTenant="),b=html.indexOf('  window.firebaseCloud = {',a);vm.runInContext(html.slice(a,b),context);
 await vm.runInContext('ensureBoardMetadata()',context);assert.equal(db.records[general+'/000'].boardStatus,undefined);assert.equal(db.records[general+'/104'].boardQueryKey,'legacy|2026-10-02');
 assert.equal(db.records[general+'/legacy-future'].boardStatus,undefined);assert.equal(db.records[general+'/confirmed'].boardStatus,'master');assert.equal(db.records[general+'/planned'].boardStatus,'advance');
 const migrationRequests=requests.length;await vm.runInContext('ensureBoardMetadata()',context);assert.equal(requests.length,migrationRequests);
 const active=await vm.runInContext('loadBoardRecords(CLOUD_DISPATCH_COLLECTION,true)',context);assert.equal(active.length,4);assert.ok(active.some(r=>r.id==='104'));
 const containerRows=await vm.runInContext('loadContainerRecords()',context);assert.equal(containerRows.length,105);assert.ok(containerRows.every(r=>r.date==='2026-09-20'));
 const again=vm.createContext({...context});vm.runInContext(html.slice(a,b),again);const writes=structuredClone(db.records);await vm.runInContext('ensureBoardMetadata()',again);assert.deepEqual(JSON.parse(JSON.stringify(db.records)),JSON.parse(JSON.stringify(writes)));
 const first=await vm.runInContext("boardHistoryPage({from:'2026-09-01',to:'2026-09-30'})",context);assert.equal(first.general.length,100);assert.equal(first.hasMore,true);
 context.cursor=first.cursors;const second=await vm.runInContext("boardHistoryPage({from:'2026-09-01',to:'2026-09-30',cursors:cursor})",context);assert.equal(second.general.length,4);assert.equal(second.hasMore,false);
 assert.equal(new Set([...first.general,...second.general].map(r=>r.id)).size,104);
});

test('正式版とtestのFirebase読取で必要なSDK関数を実際のimportから解決できる',()=>{
 for(const file of ['index.html','test/index.html']){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const match=html.match(/import\s*\{([^}]+)\}\s*from\s*"[^"\n]*firebase-firestore\.js"/);
  assert.ok(match,'Firestore import must exist');
  const names=new Set(match[1].split(',').map(s=>s.trim()));
  const sdk={orderBy:v=>v,documentId:()=> '__name__',startAfter:v=>v,query:(...v)=>v,collection:(db,path)=>path,where:(...v)=>v,limit:v=>v};
  const bindings={};for(const name of names)if(name in sdk)bindings[name]=sdk[name];
  const context=vm.createContext(bindings);
  assert.deepEqual(Array.from(vm.runInContext("query(collection({},'records'),orderBy(documentId()),startAfter('cursor'),limit(100))",context)),['records','__name__','cursor',100]);
 }
});


test('旧①引取りは編集保存しても集配へ変わらず、工程番号と担当者を保持する',async()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);
  h.run(`dispatchRecords=[{id:'legacy',caseNumber:'T000001',branchNumber:1,stageNo:1,vehicleSlot:1,date:'2026-10-02',stageName:'引取り',shipper:'ヤマト',vehicleNo:'水戸 100 あ 1234',driver:'田中'}];dispatchOpenForm('edit',dispatchRecords[0]);`);
  assert.equal(h.elements.get('dispatchSlotWorkType_1_1').value,'引取');
  let saved;h.context.window.firebaseCloud.saveDispatchGeneralStages=async(info,stages)=>{saved=stages;return {stages:[]};};
  await h.run('dispatchSubmitStageForm()');assert.equal(saved[0].workType,'引取');assert.equal(saved[0].id,'legacy');assert.equal(saved[0].driverName,'田中');
 }
});
test('終了済みの海コンは②と③に残り、マスターの通常一覧だけで非表示になる',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);
  h.run(`containerDispatchRecords=[{id:'ended',caseNumber:'T000001',date:'2026-09-20',containerNumber:'PAST',shipper:'過去'},{id:'future',caseNumber:'T000002',date:'2026-10-06',containerNumber:'FUTURE',shipper:'未来'}];containerCurrentMonth='2026-09';renderContainerDispatch();`);
  assert.ok(h.elements.get('containerTableBody').innerHTML.includes('PAST'));
  h.run('containerHistorySearch()');let body=h.elements.get('containerHistoryTableBody');assert.ok(body.innerHTML.includes('PAST'));assert.ok(body.innerHTML.includes('FUTURE'));
  h.elements.get('containerHistoryShipper').value='過去';h.run('containerHistorySearch()');assert.ok(!body.innerHTML.includes('FUTURE'));
  h.run('containerHistoryClearFilters()');assert.ok(body.innerHTML.includes('PAST'));assert.ok(body.innerHTML.includes('FUTURE'));
  h.run(`masterCurrentMonth='2026-09';renderDispatchMaster()`);assert.ok(!h.elements.get('masterTableBody').innerHTML.includes('PAST'));
 }
});
test('区分のない既存先行予定を消さず、明示的な確定入力は先行に出さない',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);
  h.run(`dispatchRecords=[{id:'legacy',caseNumber:'T000001',date:'2026-10-06',shipper:'従来予定'},{id:'master',caseNumber:'T000002',date:'2026-10-06',shipper:'確定',boardStatus:'master'},{id:'advance',caseNumber:'T000003',date:'2026-10-06',shipper:'新規予定',boardStatus:'advance'}];dispatchCurrentMonth='2026-10';renderDispatch();`);
  const text=h.elements.get('dispatchTableBody').innerHTML;assert.ok(text.includes('従来予定'));assert.ok(text.includes('新規予定'));assert.ok(!text.includes('確定'));
 }
});

// 2026-10-02 バグ修正の画面回帰確認。main/testを同じ操作で確認。
test('運転者は配車マスターの新規登録と編集を開ける',async()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);h.context.window.firebaseProfile={role:'driver'};
  h.run(`masterCurrentMonth='2026-10';masterAddNew();`);
  assert.equal(h.elements.get('masterNewKindOverlay').style.display,'flex');
  h.run(`document.getElementById('masterNewKindOverlay').style.display='none';dispatchRecords=[{id:'g1',caseNumber:'T1',branchNumber:1,date:'2026-10-02',boardStatus:'master',shipper:'荷主',loadPlace:'水戸市',unloadPlace:'笠間市 倉庫A',vehicleNo:'車A',driver:'田中'}];containerDispatchRecords=[];masterCurrentMonth='2026-10';renderDispatchMaster();`);
  const html=h.elements.get('masterTableBody').innerHTML;
  assert.ok(html.includes('<td class="master-col-origin">水戸市</td>'));
  assert.ok(html.includes('<td class="master-col-destination">笠間市 倉庫A</td>'));
  assert.ok(!html.includes('水戸市<span class="master-route-arrow">→</span>笠間市 倉庫A'));
  await h.run('masterEditRow(0)');
  assert.equal(h.elements.get('masterFormOverlay').style.display,'flex');
 }
});

test('運転者は配車の編集ボタンを使え、削除ボタンは表示されない',()=>{
 for(const file of ['index.html','test/index.html']){
  const h=htmlHarness(file);h.context.window.firebaseProfile={role:'driver'};
  h.run(`dispatchCurrentMonth='2026-10';dispatchRecords=[{id:'d1',caseNumber:'T1',date:'2026-10-06',boardStatus:'advance',shipper:'A社'}];renderDispatch();`);
  const general=h.elements.get('dispatchTableBody').innerHTML;assert.ok(general.includes('dispatchEditRow'));assert.ok(!general.includes('dispatchDeleteRow'));
  h.run(`containerCurrentMonth='2026-10';containerDispatchRecords=[{id:'c1',caseNumber:'T2',date:'2026-10-06',shipper:'B社'}];renderContainerDispatch();`);
  const container=h.elements.get('containerTableBody').innerHTML;assert.ok(container.includes('containerEditRow'));assert.ok(!container.includes('containerDeleteRow'));
 }
});

for(const file of ['index.html','test/index.html']){
 test(`${file} 旧形式編集は再取得で配列が入れ替わっても同一IDを保存`,async()=>{
  const h=htmlHarness(file);let sent;
  h.run(`dispatchRecords=[{id:'old',caseNumber:'T000001',branchNumber:1,date:'2026-10-06',shipper:'旧',count:'1台',assignments:[{branchNumber:1}]}];dispatchLastRenderedRows=dispatchRecords.slice();`);
  h.context.window.firebaseCloud={loadCaseStages:async()=>h.run('dispatchRecords=JSON.parse(JSON.stringify(dispatchRecords))'),saveDispatchRecord:async r=>(sent=r,r)};
  await h.run('dispatchEditRow(0)');await h.run('dispatchSubmitLegacyForm()');assert.equal(sent.id,'old');assert.equal(sent.caseNumber,'T000001');assert.equal(h.run('dispatchRecords.length'),1);
 });
 test(`${file} 月外コンテナ編集は同じIDと枝を送り、他工程は共通情報のみ`,async()=>{
  const h=htmlHarness(file);let sent;
  h.run(`containerDispatchRecords=[{id:'one',caseNumber:'T000001',branchNumber:1,stageNo:1,date:'2026-09-30',containerNumber:'ABCD1234567',chassisNumber:'5678'},{id:'two',caseNumber:'T000001',branchNumber:2,stageNo:2,date:'2026-10-01',containerNumber:'ABCD1234567',chassisNumber:'',time:'11:00'}];containerLastRenderedRows=[];containerOpenForm('edit',containerDispatchRecords[0]);`);
  h.context.window.firebaseCloud.saveContainerCaseStages=async (info,stages,options)=>{sent={info,stages,options};return {caseNumber:info.caseNumber,stages:[]};};
  assert.equal(h.elements.get('containerStageTime2').disabled,true);
  await h.run('containerSubmitForm()');assert.equal(sent.stages.length,1);assert.equal(sent.stages[0].id,'one');assert.equal(sent.stages[0].branchNumber,1);assert.deepEqual(Array.from(sent.options.otherExistingStageIds),['two']);
 });
 test(`${file} 旧②シャーシ空欄でも同じ案件の既存シャーシを引継ぐ`,()=>{
  const h=htmlHarness(file);h.run(`containerDispatchRecords=[{id:'a',caseNumber:'T1',stageNo:1,chassisNumber:'0001'},{id:'b',caseNumber:'T1',stageNo:2,chassisNumber:''}];containerOpenForm('edit',containerDispatchRecords[1]);`);assert.equal(h.elements.get('containerFormChassisNumber').value,'0001');
 });
 test(`${file} 案件A→B→新規の切替で共通情報が残らない`,async()=>{
  const h=htmlHarness(file);h.run(`dispatchRecords=[{id:'a',caseNumber:'A',stageNo:1,vehicleSlot:1,shipper:'A社',item:'A荷物'},{id:'b',caseNumber:'B',stageNo:1,vehicleSlot:1,shipper:'B社',item:'B荷物'}];dispatchOpenForm('create',null);`);
  const sel=h.elements.get('dispatchFormCaseSelect');for(const n of ['A','B','']){sel.value=n;await h.run('dispatchOnCaseSelectChanged()');assert.equal(h.elements.get('dispatchFormShipper').value,n?n+'社':'');assert.equal(h.elements.get('dispatchFormItem').value,n?n+'荷物':'');}
 });
 test(`${file} 検索取消後の旧応答は新しい検索結果とbusy状態を上書きしない`,async()=>{
  const h=htmlHarness(file),pending=[];h.context.window.firebaseCloud.loadBoardHistoryPage=()=>new Promise(resolve=>pending.push(resolve));
  h.elements.get('masterHistoryFrom').value='2026-09-01';h.elements.get('masterHistoryTo').value='2026-09-30';
  const old=h.run('masterSearchHistory()');h.run('masterExitHistory()');const next=h.run('masterSearchHistory()');
  pending[0]({general:[],container:[],cursors:{},hasMore:false});await old;assert.equal(h.run('masterHistoryBusy'),true);assert.equal(h.run('masterHistoryMode'),false);
  pending[1]({general:[],container:[],cursors:{},hasMore:false});await next;assert.equal(h.run('masterHistoryMode'),true);assert.equal(h.run('masterHistoryBusy'),false);
 });
 test(`${file} 遅い案件Aの応答はBの共通情報を上書きしない`,async()=>{
  const h=htmlHarness(file),pending=[];h.context.window.firebaseCloud.loadCaseStages=()=>new Promise(resolve=>pending.push(resolve));
  h.run(`dispatchRecords=[{id:'a',caseNumber:'A',stageNo:1,shipper:'A社'},{id:'b',caseNumber:'B',stageNo:1,shipper:'B社'}];dispatchOpenForm('create',null);`);
  const sel=h.elements.get('dispatchFormCaseSelect');sel.value='A';const a=h.run('dispatchOnCaseSelectChanged()');sel.value='B';const b=h.run('dispatchOnCaseSelectChanged()');
  pending[1]();await b;pending[0]();await a;assert.equal(h.elements.get('dispatchFormShipper').value,'B社');assert.equal(h.run('dispatchCaseLoading'),false);
 });
}
for(const file of ['index.html','test/index.html']){
 test(`${file} 点検保存後に18番必須指定と前車の入力を解除する`,()=>{
  const html=fs.readFileSync(path.join(root,file),'utf8');
  const start=html.indexOf('function resetAfterSave(){'),end=html.indexOf('\n}',start)+2;
  const fields=new Map(['overall','abnormal','previous','today','vehicle','driver','vehicleSelect','driverSelect','shakenConfirm','managerConfirmPerson'].map(id=>[id,{value:'前車の値',checked:true,style:{}}]));
  const ctx=vm.createContext({document:{getElementById:id=>fields.get(id),querySelectorAll:()=>[]},resetDriverChange:()=>{},updateProgress:()=>{}});
  vm.runInContext('let requireItem18=true;const results={1:"○",18:"○"};'+html.slice(start,end)+';resetAfterSave();',ctx);
  assert.equal(vm.runInContext('requireItem18',ctx),false);assert.equal(vm.runInContext('Object.keys(results).length',ctx),0);assert.equal(fields.get('vehicleSelect').value,'');assert.equal(fields.get('shakenConfirm').checked,false);
 });
}
