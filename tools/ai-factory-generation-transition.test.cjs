'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {AXIS_BY_ID}=require('./ai-factory-axis-registry.cjs');
const {EVIDENCE_LEDGER}=require('./ai-factory-evidence-ledger.cjs');
const {scoreAxis}=require('./ai-factory-score-axes.cjs');
const generator=require('./ai-factory-generate-axis.cjs');
const {EXTERNAL_PROOFS}=require('./ai-factory-external-evidence.cjs');

const inventoryProof=EXTERNAL_PROOFS.find(x=>x.repository==='TheCandyLoop/inventory-management-crud');
const bookingProof=EXTERNAL_PROOFS.find(x=>x.repository==='rizbud/express-sqlite-booking-system');

test('G81 外部2本は別リポジトリ・別固定コミットで実証されている',()=>{
  assert.ok(inventoryProof);
  assert.ok(bookingProof);
  assert.notEqual(inventoryProof.repository,bookingProof.repository);
  assert.notEqual(inventoryProof.commitSha,bookingProof.commitSha);
  assert.equal(inventoryProof.applicationModified,false);
  assert.equal(bookingProof.applicationModified,false);
});

test('G82 候補generation 71から登録generation 81へ世代が進んでいる',()=>{
  for(const proof of EXTERNAL_PROOFS){
    assert.equal(proof.candidateGeneration,71);
    assert.equal(proof.registeredGeneration,81);
    const axis=AXIS_BY_ID.get(proof.generatedAxisId);
    assert.equal(axis.generationIntroduced,81);
  }
});

test('G83 在庫外部実証は境界強制軸を新規系譜へ登録した',()=>{
  const axis=AXIS_BY_ID.get('boundary.server-domain-enforcement');
  assert.ok(axis);
  assert.ok(axis.inheritedFrom.includes('axis.candidate-generation'));
  assert.equal(inventoryProof.outcome,'detected');
  assert.equal(inventoryProof.observation.persistedNegative,true);
});

test('G84 予約外部実証は資源消費符号軸を新規系譜へ登録した',()=>{
  const axis=AXIS_BY_ID.get('resource.consumption-sign-invariant');
  assert.ok(axis);
  assert.ok(axis.inheritedFrom.includes('axis.candidate-generation'));
  assert.equal(bookingProof.outcome,'detected');
  assert.equal(bookingProof.observation.beforeSeats,10);
  assert.equal(bookingProof.observation.afterSeats,13);
});

test('G85 2つの外部検出Evidenceは各generation 81軸へ一意に接続される',()=>{
  for(const proof of EXTERNAL_PROOFS){
    const events=EVIDENCE_LEDGER.filter(e=>e.evidenceId===proof.proofId);
    assert.equal(events.length,1);
    assert.equal(events[0].axisId,proof.generatedAxisId);
    assert.equal(events[0].generation,81);
    assert.equal(events[0].outcome,'detected');
  }
});

test('G86 Evidence 1件だけの新規軸は自動継承eligibleにしない',()=>{
  for(const proof of EXTERNAL_PROOFS){
    const result=scoreAxis(proof.generatedAxisId);
    assert.equal(result.eventCount,1);
    assert.equal(result.eligible,false);
  }
});

test('G87 generation 81登録後は同じaxisIdの再生成候補をmeta STOPする',()=>{
  for(const axisId of ['boundary.server-domain-enforcement','resource.consumption-sign-invariant']){
    const c=generator.metaValidateCandidate({
      axisId,
      label:'registered external axis',
      riskStatement:'registered external axis should not be re-added',
      detector:'generation-transition-test',
      provenance:[{path:'fixture',fact:'registered'}],
      proposedTests:['do not duplicate']
    });
    assert.equal(c.meta.pass,false);
    assert.ok(c.meta.issues.includes('axis-id-already-exists'));
  }
});

test('G88 新規軸の親にはcandidate-generationと過去有効軸が残る',()=>{
  for(const axisId of ['boundary.server-domain-enforcement','resource.consumption-sign-invariant']){
    const axis=AXIS_BY_ID.get(axisId);
    assert.ok(axis.inheritedFrom.includes('axis.candidate-generation'));
    assert.ok(axis.inheritedFrom.includes('impact.test-selection'));
    assert.ok(axis.inheritedFrom.includes('promotion.shared-dna'));
  }
});

test('G89 Priority 6生成器にmain自動昇格・git push・update_ref経路はない',()=>{
  const source=fs.readFileSync(path.join(__dirname,'ai-factory-generate-axis.cjs'),'utf8');
  assert.equal(source.includes('update_ref'),false);
  assert.equal(source.includes('git push'),false);
  assert.equal(source.includes('refs/heads/main'),false);
});

test('G90 2外部アプリから異なる2軸が生成され同一軸への収束ではない',()=>{
  assert.notEqual(inventoryProof.generatedAxisId,bookingProof.generatedAxisId);
  assert.equal(inventoryProof.generatedAxisId,'boundary.server-domain-enforcement');
  assert.equal(bookingProof.generatedAxisId,'resource.consumption-sign-invariant');
});
