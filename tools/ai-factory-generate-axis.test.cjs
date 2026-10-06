'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const generator=require('./ai-factory-generate-axis.cjs');

function fixture(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-factory-v6-'));
  for(const [name,content] of Object.entries(files)){
    const full=path.join(root,name);
    fs.mkdirSync(path.dirname(full),{recursive:true});
    fs.writeFileSync(full,content);
  }
  return root;
}

test('G71 candidate-generation軸は過去の有効軸を継承して登録される',()=>{
  assert.equal(validateRegistry().pass,true);
  const axis=AXIS_BY_ID.get('axis.candidate-generation');
  assert.ok(axis);
  assert.equal(axis.generationIntroduced,71);
  assert.ok(axis.inheritedFrom.includes('axis.effectiveness-scoring'));
  assert.ok(axis.inheritedFrom.includes('impact.test-selection'));
});

test('G72 リスクシグナルが無いプロジェクトでは新規軸を捏造しない',()=>{
  const root=fixture({'app.js':'console.log("hello");'});
  const result=generator.generateAxisCandidates(root);
  assert.deepEqual(result.candidates,[]);
});

test('G73 UI/API境界シグナルはraw候補を生成し、登録済み軸は重複としてmeta STOPする',()=>{
  const root=fixture({
    'public/index.html':'<input type="number" id="quantity" min="0">',
    'server.js':'app.post("/x",(req,res)=>{ const { quantity }=req.body; save(quantity); });'
  });
  const project=generator.loadProject(root);
  const raw=generator.detectBoundaryServerEnforcement(project);
  assert.equal(raw.length,1);
  assert.equal(raw[0].axisId,'boundary.server-domain-enforcement');
  const candidate=generator.metaValidateCandidate(raw[0]);
  assert.equal(candidate.meta.pass,false);
  assert.ok(candidate.meta.issues.includes('axis-id-already-exists'));
});

test('G74 資源消費シグナルはraw候補を生成し、登録済み軸は重複としてmeta STOPする',()=>{
  const root=fixture({
    'repo.ts':'const q="capacity - COALESCE(SUM(b.number_of_seats), 0)";',
    'validator.ts':'if (!booking.number_of_seats) errors.push("required");'
  });
  const project=generator.loadProject(root);
  const raw=generator.detectConsumptionSignInvariant(project);
  assert.equal(raw.length,1);
  assert.equal(raw[0].axisId,'resource.consumption-sign-invariant');
  const candidate=generator.metaValidateCandidate(raw[0]);
  assert.equal(candidate.meta.pass,false);
  assert.ok(candidate.meta.issues.includes('axis-id-already-exists'));
});

test('G75 サーバー側に下限ガードがあれば境界強制軸候補を生成しない',()=>{
  const root=fixture({
    'index.html':'<input type="number" id="quantity" min="0">',
    'server.js':'const { quantity }=req.body; if (quantity < 0) return reject();'
  });
  const result=generator.generateAxisCandidates(root);
  assert.equal(result.candidates.some(x=>x.axisId==='boundary.server-domain-enforcement'),false);
});

test('G76 正数ガード済みなら資源消費符号軸候補を生成しない',()=>{
  const root=fixture({
    'repo.ts':'const q="capacity - COALESCE(SUM(b.number_of_seats), 0)";',
    'validator.ts':'if (booking.number_of_seats < 1) errors.push("positive only");'
  });
  const result=generator.generateAxisCandidates(root);
  assert.equal(result.candidates.some(x=>x.axisId==='resource.consumption-sign-invariant'),false);
});

test('G77 候補は既存軸との新規性・provenance・proposed testをメタ検証する',()=>{
  const candidate=generator.metaValidateCandidate({
    axisId:'novel.example-invariant',
    label:'novel invariant',
    riskStatement:'A novel technical invariant is violated.',
    detector:'fixture',
    provenance:[{path:'a.js',fact:'signal'}],
    proposedTests:['test it']
  });
  assert.equal(candidate.meta.pass,true);
  assert.ok(candidate.novelty.noveltyScore>=0.55);
  assert.ok(candidate.provenance.length>0);
});

test('G78 既存axisIdの焼き直しはメタ検証でSTOPする',()=>{
  const candidate=generator.metaValidateCandidate({
    axisId:'auth.context-isolation',
    label:'auth context isolation',
    riskStatement:'same existing axis',
    detector:'fixture',
    provenance:[{path:'a.js',fact:'signal'}],
    proposedTests:['test it']
  });
  assert.equal(candidate.meta.pass,false);
  assert.ok(candidate.meta.issues.includes('axis-id-already-exists'));
});

test('G79 Evidence未確認の候補は次世代軸へ昇格できない',()=>{
  const candidate=generator.metaValidateCandidate({
    axisId:'novel.example-invariant',
    label:'novel invariant',
    riskStatement:'A novel technical invariant is violated.',
    detector:'fixture',
    provenance:[{path:'a.js',fact:'signal'}],
    proposedTests:['test it']
  });
  assert.throws(()=>generator.promoteCandidateToAxis(candidate,{confirmed:false,issueDetected:true,evidenceId:'E1'}));
});

test('G80 問題検出Evidenceが確認された候補だけ次世代軸オブジェクトへ昇格できる',()=>{
  const candidate=generator.metaValidateCandidate({
    axisId:'novel.example-invariant',
    label:'novel invariant',
    riskStatement:'A novel technical invariant is violated.',
    detector:'fixture',
    provenance:[{path:'a.js',fact:'signal'}],
    proposedTests:['test it']
  });
  const axis=generator.promoteCandidateToAxis(candidate,{confirmed:true,issueDetected:true,evidenceId:'E-PASS'});
  assert.equal(axis.axisId,'novel.example-invariant');
  assert.equal(axis.generationIntroduced,81);
  assert.ok(axis.inheritedFrom.includes('axis.candidate-generation'));
  assert.equal(axis.generatedBy,'axis.candidate-generation');
  assert.equal(axis.evidenceId,'E-PASS');
});

test('生成候補はEvidenceスコア済みの過去軸から継承元を選ぶ',()=>{
  const inherited=generator.getInheritedAxes();
  assert.ok(inherited.length>=1);
  assert.ok(inherited.length<=3);
  for(const id of inherited) assert.ok(AXIS_BY_ID.has(id));
});

test('候補生成器自身はレジストリを書き換える自動昇格を持たない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'ai-factory-generate-axis.cjs'),'utf8');
  assert.equal(source.includes('writeFileSync') && source.includes('ai-factory-axis-registry.cjs'),false);
});
