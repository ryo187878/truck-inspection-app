const assert=require("node:assert/strict");
const Y=require("../yamato-daily.js");
const d="2026-10-02";
const defaults=Y.buildDailyRecords(d);
assert.equal(defaults.length,3);
assert.deepEqual(defaults.map(x=>[x.id,x.vehicleNo,x.driver]),[
 ["daily-yamato-2026-10-02-1","11","刈屋"],
 ["daily-yamato-2026-10-02-2","6528","髙野"],
 ["daily-yamato-2026-10-02-3","33","若菜"]
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
