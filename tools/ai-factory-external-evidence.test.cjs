'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const {EVIDENCE_LEDGER,validateLedger}=require('./ai-factory-evidence-ledger.cjs');
const {scoreAxis}=require('./ai-factory-score-axes.cjs');
const {EXTERNAL_PROOFS,validateExternalProofs}=require('./ai-factory-external-evidence.cjs');

test('外部Evidence記録は固定コミット2本・無改変で整合する',()=>{
  const proofCheck=validateExternalProofs();
  assert.equal(proofCheck.pass,true,proofCheck.issues.join(', '));
  assert.equal(EXTERNAL_PROOFS.length,2);
  assert.ok(EXTERNAL_PROOFS.every(x=>x.applicationModified===false));
});

test('外部在庫アプリの実観測をEvidenceとして保持する',()=>{
  const p=EXTERNAL_PROOFS.find(x=>x.repository==='TheCandyLoop/inventory-management-crud');
  assert.ok(p);
  assert.equal(p.generatedAxisId,'boundary.server-domain-enforcement');
  assert.equal(p.observation.createStatus,201);
  assert.equal(p.observation.persistedNegative,true);
  assert.ok(p.observation.quantity<0);
  assert.ok(p.observation.price<0);
});

test('外部予約アプリの実観測をEvidenceとして保持する',()=>{
  const p=EXTERNAL_PROOFS.find(x=>x.repository==='rizbud/express-sqlite-booking-system');
  assert.ok(p);
  assert.equal(p.generatedAxisId,'resource.consumption-sign-invariant');
  assert.equal(p.observation.bookingStatus,201);
  assert.equal(p.observation.beforeSeats,10);
  assert.equal(p.observation.afterSeats,13);
  assert.equal(p.observation.increased,true);
});

test('2つの新規軸はgeneration 81でcandidate-generation系譜を継承する',()=>{
  assert.equal(validateRegistry().pass,true);
  for(const p of EXTERNAL_PROOFS){
    const axis=AXIS_BY_ID.get(p.generatedAxisId);
    assert.ok(axis,p.generatedAxisId);
    assert.equal(axis.generationIntroduced,81);
    assert.ok(axis.inheritedFrom.includes('axis.candidate-generation'));
  }
});

test('外部検出2件はEvidence台帳へdetectedとして接続される',()=>{
  const ledgerCheck=validateLedger();
  assert.equal(ledgerCheck.pass,true,ledgerCheck.issues.join(', '));
  for(const p of EXTERNAL_PROOFS){
    const e=EVIDENCE_LEDGER.find(x=>x.evidenceId===p.proofId);
    assert.ok(e,p.proofId);
    assert.equal(e.axisId,p.generatedAxisId);
    assert.equal(e.outcome,'detected');
    assert.equal(e.issueCount,1);
  }
});

test('新規軸はEvidence 1件だけなのでPriority 5ルール上まだ自動継承eligibleではない',()=>{
  for(const p of EXTERNAL_PROOFS){
    const score=scoreAxis(p.generatedAxisId);
    assert.equal(score.eventCount,1);
    assert.equal(score.eligible,false);
  }
});
