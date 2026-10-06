'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const gate=require('./promotion-gate.cjs');

function html(refs,variant='same'){
  const general=variant==='general-drift'
    ? 'function dispatchMakeEmptySlot(){ return {stage1:{chassisNumber:""}}; }'
    : 'function dispatchMakeEmptySlot(){ return {stage1:{}}; }';
  return [
    '<script src="'+refs.dispatch+'"></script>',
    '<script src="'+refs.today+'"></script>',
    '<script src="'+refs.yamato+'"></script>',
    'async function ensureBoardMetadata(){ return 1; }',
    'async function promoteAdvanceRecords(){ return 1; }',
    'function renderTodayVehicleLists(){ return 1; }',
    'function renderMasters(){ return 1; }',
    general,
    'function dispatchOnFormCountChanged(){ return 1; }'
  ].join('\n');
}

function fixture({drift=false,duplicateToday=false,testTodayRef='../today-vehicle-status.js',testExtra='' }={}){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tramo-promotion-gate-'));
  fs.mkdirSync(path.join(root,'test'),{recursive:true});
  fs.writeFileSync(path.join(root,'dispatch-service.js'),'module.exports={};');
  fs.writeFileSync(path.join(root,'today-vehicle-status.js'),'module.exports={};');
  fs.writeFileSync(path.join(root,'yamato-daily.js'),'module.exports={};');
  fs.writeFileSync(path.join(root,'index.html'),html({
    dispatch:'./dispatch-service.js',
    today:'./today-vehicle-status.js',
    yamato:'./yamato-daily.js'
  }));
  fs.writeFileSync(path.join(root,'test','index.html'),html({
    dispatch:'../dispatch-service.js',
    today:testTodayRef,
    yamato:'../yamato-daily.js'
  },drift?'general-drift':'same')+'\n'+testExtra);
  if(duplicateToday) fs.writeFileSync(path.join(root,'test','today-vehicle-status.js'),'module.exports={};');
  return root;
}

test('共有DNAと共有ファイル参照が一致すればPASS',()=>{
  const root=fixture();
  const result=gate.evaluatePromotionGate(root);
  assert.equal(result.pass,true);
  assert.equal(result.issues.length,0);
});

test('共有DNA外のtest専用差分は誤警報にしない',()=>{
  const root=fixture({testExtra:'\nfunction testOnlyLoginHelper(){ return "test-only"; }'});
  const result=gate.evaluatePromotionGate(root);
  assert.equal(result.pass,true);
});

test('test側だけ共有DNAが変わったらSTOP',()=>{
  const root=fixture({drift:true});
  const result=gate.evaluatePromotionGate(root);
  assert.equal(result.pass,false);
  assert.ok(result.issues.some(x=>x.code==='SHARED_DNA_MISMATCH'&&x.name==='general-dispatch-editor'));
});

test('共有ファイルのtest内コピーが残っていたらSTOP',()=>{
  const root=fixture({duplicateToday:true});
  const result=gate.evaluatePromotionGate(root);
  assert.equal(result.pass,false);
  assert.ok(result.issues.some(x=>x.code==='DUPLICATE_SHARED_FILE'&&x.name==='today-vehicle-status'));
});

test('testが共有ファイルではなくローカルコピーを参照したらSTOP',()=>{
  const root=fixture({testTodayRef:'./today-vehicle-status.js'});
  const result=gate.evaluatePromotionGate(root);
  assert.equal(result.pass,false);
  assert.ok(result.issues.some(x=>x.code==='TEST_NON_CANONICAL_REF'&&x.name==='today-vehicle-status'));
});

test('Gateは判定だけを行い自動昇格処理を持たない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'promotion-gate.cjs'),'utf8');
  assert.equal(source.includes('copyFileSync'),false);
  assert.equal(source.includes('renameSync'),false);
  assert.equal(source.includes('writeFileSync'),false);
});
