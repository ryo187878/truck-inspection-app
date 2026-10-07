'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {inspectEvidence,proposeProblemReactivation}=require('./ai-factory-evidence-sufficiency.cjs');
const signal=Object.freeze({signalId:'OBS-UNKNOWN-1',classification:'MISSED_RISK',observation:'Existing tests passed despite an unexplained change to the validation structure.'});
const ev=(evidenceId,role,sourceId,other={})=>({evidenceId,role,sourceId,signalId:signal.signalId,verified:true,independent:true,outcome:'supports',...other});
const sufficient=[ev('P-1','provenance','A'),ev('R-1','reproduction','B'),ev('C-1','control','C')];

test('E5G-1: no Evidence produces explicit missing-role requests, not an invented Target',()=>{
  const result=inspectEvidence(signal,[],{remainingBudget:2});
  assert.equal(result.state,'REQUEST_MORE');
  assert.deepEqual(result.missingRoles,['provenance','reproduction','control']);
  assert.equal(result.targetCandidate,undefined);
});

test('E5G-2: weak single-source Evidence is insufficient, even with all roles',()=>{
  const result=inspectEvidence(signal,[ev('P','provenance','S'),ev('R','reproduction','S'),ev('C','control','S')],{remainingBudget:1});
  assert.equal(result.state,'REQUEST_MORE');
  assert.ok(result.requests.includes('independent-corroboration'));
});

test('E5G-3: sufficient independent, verified role coverage permits ETD only, not self-promotion',()=>{
  const result=inspectEvidence(signal,sufficient,{remainingBudget:0});
  assert.equal(result.state,'ETD_ELIGIBLE');
  assert.equal(result.formalPromotion,false);
  assert.equal(result.requiresGate,true);
});

test('E5G-4: verified contradictions block eligibility despite supporting majority',()=>{
  const evidence=[...sufficient,...Array.from({length:15},(_,i)=>ev('EX-'+i,'control','S-'+i)),ev('D','control','D',{outcome:'contradicts'})];
  const result=inspectEvidence(signal,evidence,{remainingBudget:0});
  assert.equal(result.state,'EVIDENCE_FREEZE');
  assert.ok(result.requests.includes('resolve-contradiction'));
  assert.equal(result.releaseBlocked,true);
});

test('E5G-5: irrelevant or unverified flood cannot masquerade as sufficiency',()=>{
  const noise=Array.from({length:100},(_,i)=>ev('N-'+i,'reproduction','SRC-'+i,{signalId:'OTHER',verified:i%2===0}));
  const result=inspectEvidence(signal,[ev('P','provenance','S'),...noise],{remainingBudget:0});
  assert.equal(result.state,'EVIDENCE_FREEZE');
  assert.ok(result.missingRoles.includes('reproduction'));
  assert.ok(result.missingRoles.includes('control'));
  assert.equal(result.freezeRecord.signalId,signal.signalId);
});

test('E5G-6: duplicate source IDs cannot fulfill independent corroboration',()=>{
  const result=inspectEvidence(signal,[ev('P','provenance','S'),ev('R','reproduction','S'),ev('C','control','S')],{remainingBudget:0});
  assert.equal(result.state,'EVIDENCE_FREEZE');
  assert.ok(result.requests.includes('independent-corroboration'));
});

test('E5G-7: missing Evidence can reactivate only as a candidate after independent meaningful addition',()=>{
  const original=[ev('P','provenance','A'),ev('R','reproduction','B')];
  const frozen=inspectEvidence(signal,original,{remainingBudget:0});
  assert.equal(frozen.state,'EVIDENCE_FREEZE');
  const proposal=proposeProblemReactivation(frozen,original,[ev('C','control','C')]);
  assert.equal(proposal.state,'REACTIVATE_CANDIDATE');
  assert.equal(proposal.autoResume,false);
  assert.equal(proposal.requiresGate,true);
  assert.equal(proposal.formalPromotion,false);
  assert.ok(proposal.evidenceIds.includes('C'));
});

test('E5G-8: duplicated/unverified/unrelated additions cannot reactivate a frozen problem',()=>{
  const original=[ev('P','provenance','A'),ev('R','reproduction','B')];
  const frozen=inspectEvidence(signal,original,{remainingBudget:0});
  const additions=[ev('P','provenance','A'),ev('C','control','X',{verified:false}),ev('Z','control','Z',{signalId:'OTHER'})];
  const proposal=proposeProblemReactivation(frozen,original,additions);
  assert.equal(proposal.state,'EVIDENCE_FREEZE');
  assert.equal(proposal.autoResume,false);
});

test('E5G-9: severe MISSED_RISK frozen task must keep release blocked; history retained',()=>{
  const evidence=[ev('P','provenance','A')];
  const snapshot=JSON.stringify(evidence);
  const result=inspectEvidence(signal,evidence,{remainingBudget:0});
  assert.equal(result.state,'EVIDENCE_FREEZE');
  assert.equal(result.releaseBlocked,true);
  assert.deepEqual(result.freezeRecord.evidenceIds,['P']);
  assert.equal(JSON.stringify(evidence),snapshot);
});
