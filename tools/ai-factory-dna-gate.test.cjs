'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {STATES,classifyDnaCandidate,inheritanceDecision}=require('./ai-factory-dna-gate.cjs');

test('P6-1 Evidence未確認は高スコアでもBLOCK',()=>{
  assert.equal(classifyDnaCandidate({score:100,evidenceEvents:3,confirmed:false,antibodyPass:true,uniqueAdditionalDetection:true}).state,STATES.BLOCK);
});

test('P6-2 抗体FAILは高スコアでもBLOCK',()=>{
  assert.equal(classifyDnaCandidate({score:100,evidenceEvents:3,confirmed:true,antibodyPass:false,uniqueAdditionalDetection:true}).state,STATES.BLOCK);
});

test('P6-3 missed riskがあればBLOCK',()=>{
  assert.equal(classifyDnaCandidate({score:100,evidenceEvents:3,confirmed:true,antibodyPass:true,uniqueAdditionalDetection:true,missedRiskCount:1}).state,STATES.BLOCK);
});

test('P6-4 反復Evidence・80点以上・単独追加検出・False BLOCKなしで正式継承',()=>{
  assert.equal(classifyDnaCandidate({score:84,evidenceEvents:2,confirmed:true,antibodyPass:true,uniqueAdditionalDetection:true,falseBlockCount:0}).state,STATES.FORMAL);
});

test('P6-5 Evidence1件の有効候補は正式化せず限定',()=>{
  assert.equal(classifyDnaCandidate({score:75,evidenceEvents:1,confirmed:true,antibodyPass:true,uniqueAdditionalDetection:true}).state,STATES.LIMITED);
});

test('P6-6 60点以上でも単独追加検出も反復Evidenceも無ければ観察',()=>{
  assert.equal(classifyDnaCandidate({score:70,evidenceEvents:1,confirmed:true,antibodyPass:true}).state,STATES.OBSERVE);
});

test('P6-7 40〜59点は観察',()=>{
  assert.equal(classifyDnaCandidate({score:50,evidenceEvents:2,confirmed:true,antibodyPass:true}).state,STATES.OBSERVE);
});

test('P6-8 40点未満は休眠',()=>{
  assert.equal(classifyDnaCandidate({score:39,evidenceEvents:2,confirmed:true,antibodyPass:true}).state,STATES.DORMANT);
});

test('P6-9 失敗能力は継承しなくても失敗Evidenceは保持する',()=>{
  const d=inheritanceDecision({axisId:'new.axis'},{score:100,evidenceEvents:2,confirmed:true,antibodyPass:false,uniqueAdditionalDetection:true});
  assert.equal(d.inheritCapability,false);
  assert.equal(d.retainFailureEvidence,true);
  assert.equal(d.state,STATES.BLOCK);
});

test('P6-10 限定採用は正式DNAとして能力継承しない',()=>{
  const d=inheritanceDecision({axisId:'new.axis'},{score:75,evidenceEvents:1,confirmed:true,antibodyPass:true,uniqueAdditionalDetection:true});
  assert.equal(d.state,STATES.LIMITED);
  assert.equal(d.inheritCapability,false);
  assert.equal(d.retainFailureEvidence,true);
});
