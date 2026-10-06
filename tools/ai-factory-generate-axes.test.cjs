'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const generator=require('./ai-factory-generate-axes.cjs');

function tempProfile(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'af-axis-'));
  for(const [name,content] of Object.entries(files)){
    const full=path.join(root,name);
    fs.mkdirSync(path.dirname(full),{recursive:true});
    fs.writeFileSync(full,content);
  }
  return {root,profile:generator.profileDirectory(root,{name:'fixture'})};
}

test('G71 novelty-generation軸は前世代の有効度評価とtest-selectionを継承する',()=>{
  assert.equal(validateRegistry().pass,true);
  const axis=AXIS_BY_ID.get('axis.novelty-generation');
  assert.ok(axis);
  assert.equal(axis.generationIntroduced,71);
  assert.ok(axis.inheritedFrom.includes('axis.effectiveness-scoring'));
  assert.ok(axis.inheritedFrom.includes('impact.test-selection'));
});

test('G72 ソースprofileは対象ファイルを決定的に収集する',()=>{
  const {root,profile}=tempProfile({'a.js':'const quantity=1;','b.md':'inventory price','node_modules/x.js':'ignored'});
  try{
    assert.deepEqual(profile.files.map(x=>x.path),['a.js','b.md']);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G73 既存軸と同一の候補はnovelty不足としてメタ検証を通さない',()=>{
  const candidate={
    axisId:'auth.context-isolation',label:'登録 通常ログイン context 分離',tags:['auth','context'],
    generationProposed:71,sourceSignals:[['auth'],['context'],['login']],sourceFiles:['x.js'],
    riskStatement:'x',testHypothesis:'x',oracle:'x'
  };
  Object.assign(candidate,generator.noveltyAgainstExisting(candidate));
  candidate.meta=generator.metaValidateCandidate(candidate);
  assert.equal(candidate.meta.pass,false);
});

test('G74 在庫コードからinventory.nonnegative-domain候補を自動生成する',()=>{
  const {root,profile}=tempProfile({
    'server.js':'inventory products quantity price INSERT INTO products',
    'public/index.html':'<input type="number" id="quantity" min="0"><input id="price" min="0">'
  });
  try{
    const ids=generator.generateCandidates(profile).map(x=>x.axisId);
    assert.ok(ids.includes('inventory.nonnegative-domain'));
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G75 予約容量コードからresource.capacity-conservation候補を自動生成する',()=>{
  const {root,profile}=tempProfile({
    'booking.ts':'booking number_of_seats available_seats capacity reservation'
  });
  try{
    const c=generator.generateCandidates(profile).find(x=>x.axisId==='resource.capacity-conservation');
    assert.ok(c);
    assert.equal(c.meta.pass,true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G76 新規候補はrisk・仮説・oracle・source filesを持つ',()=>{
  const {root,profile}=tempProfile({
    'booking.ts':'booking number_of_seats available_seats capacity reservation'
  });
  try{
    const c=generator.generateCandidates(profile).find(x=>x.axisId==='resource.capacity-conservation');
    assert.ok(c.riskStatement);
    assert.ok(c.testHypothesis);
    assert.ok(c.oracle);
    assert.ok(c.sourceFiles.length>=1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G77 signal不足の推測だけでは新規軸を生成しない',()=>{
  const {root,profile}=tempProfile({'readme.md':'this app has booking'});
  try{
    assert.equal(generator.generateCandidates(profile).length,0);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G78 meta PASSだけでは登録せず外部Evidenceを必須にする',()=>{
  const {root,profile}=tempProfile({
    'booking.ts':'booking number_of_seats available_seats capacity reservation'
  });
  try{
    const c=generator.generateCandidates(profile).find(x=>x.axisId==='resource.capacity-conservation');
    assert.throws(()=>generator.promoteCandidate(c,null),/Evidence/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G79 外部Evidence合格後は有効な旧軸を継承した登録draftを作る',()=>{
  const {root,profile}=tempProfile({
    'booking.ts':'booking number_of_seats available_seats capacity reservation'
  });
  try{
    const c=generator.generateCandidates(profile).find(x=>x.axisId==='resource.capacity-conservation');
    const promoted=generator.promoteCandidate(c,{
      evidenceId:'EXT-BOOKING-1',axisId:c.axisId,outcome:'detected'
    });
    assert.ok(promoted.inheritedFrom.includes('axis.novelty-generation'));
    assert.ok(promoted.inheritedFrom.length>=2);
    assert.equal(promoted.evidenceOutcome,'detected');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G80 候補生成と登録を分離し自動昇格を行わない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'ai-factory-generate-axes.cjs'),'utf8');
  assert.match(source,/function generateCandidates/);
  assert.match(source,/function promoteCandidate/);
  assert.equal(source.includes('update_ref'),false);
  assert.equal(source.includes('git push'),false);
});
