const assert=require("node:assert/strict");
const Y=require("../yamato-daily.js");
const d="2026-10-02";
const defaults=Y.buildDailyRecords(d);
assert.equal(defaults.length,3);
assert.deepEqual(defaults.map(x=>[x.id,x.vehicleNo,x.driver]),[
 ["daily-yamato-2026-10-02-1","水戸136い11","刈屋"],
 ["daily-yamato-2026-10-02-2","水戸100か6528","髙野"],
 ["daily-yamato-2026-10-02-3","水戸138あ33","若菜"]
]);
assert.equal(new Set(defaults.map(x=>x.id)).size,3);
assert.deepEqual(Y.buildDailyRecords(d),defaults);
const row=(shipper,caseNumber,branchNumber,extra={})=>({record:{date:d,shipper,caseNumber,...extra},targetBranchNumber:branchNumber});
const rows=[
 row("善心","T000002",1),row("ヤマト","",1,{dailySlot:3}),row("宏商","T000003",1),
 row("ヤマト","",1,{dailySlot:1}),row("その他A","T000004",1),row("西原産業","T000001",1),
 row("ヤマト","",1,{dailySlot:2}),row("宏商","T000001",2),row("宏商","T000001",1)
];
const sorted=Y.sortMasterRows(rows);
assert.deepEqual(sorted.slice(0,3).map(x=>x.record.dailySlot),[1,2,3]);
assert.deepEqual(sorted.map(x=>x.record.shipper),["ヤマト","ヤマト","ヤマト","その他A","西原産業","宏商","宏商","宏商","善心"]);
const kosho=sorted.filter(x=>x.record.shipper==="宏商");
assert.deepEqual(kosho.map(x=>[x.record.caseNumber,x.targetBranchNumber]),[["T000001",1],["T000001",2],["T000003",1]]);
const tomorrow=Y.sortMasterRows([row("善心","A",1,{date:"2026-10-03"}),row("ヤマト","",1,{dailySlot:1})]);
assert.equal(tomorrow[0].record.date,d);
console.log("Yamato daily/group sort: 9/9 PASS");

const mixedDates=[
 row("善心","T9",1,{date:"2026-10-03"}),
 row("宏商","T2",2,{date:"2026-10-02"}),
 row("ヤマト","",1,{date:"2026-10-03",dailySlot:2}),
 row("ヤマト","",1,{date:"2026-10-02",dailySlot:3}),
 row("宏商","T2",1,{date:"2026-10-02"}),
 row("ヤマト","",1,{date:"2026-10-02",dailySlot:1}),
 row("ヤマト","",1,{date:"2026-10-02",dailySlot:2})
];
const mixedSorted=Y.sortMasterRows(mixedDates);
assert.deepEqual(mixedSorted.slice(0,5).map(x=>[x.record.date,x.record.shipper,x.record.dailySlot||0,x.targetBranchNumber]),[
 ["2026-10-02","ヤマト",1,1],["2026-10-02","ヤマト",2,1],["2026-10-02","ヤマト",3,1],
 ["2026-10-02","宏商",0,1],["2026-10-02","宏商",0,2]
]);
const otherRows=Y.sortMasterRows([row("B社","B2",1),row("A社","A1",1),row("B社","B1",1),row("善心","Z",1)]);
assert.deepEqual(otherRows.map(x=>x.record.shipper),["B社","B社","A社","善心"]);
assert.deepEqual(otherRows.filter(x=>x.record.shipper==="B社").map(x=>x.record.caseNumber),["B1","B2"]);
assert.equal(Y.dailyId("2026-10-03",1),"daily-yamato-2026-10-03-1");
console.log("Yamato extended ordering/id tests: PASS");
