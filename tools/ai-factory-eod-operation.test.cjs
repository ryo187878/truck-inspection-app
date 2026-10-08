'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverTargets}=require('./ai-factory-etd-target.cjs');
const {discoverOperations}=require('./ai-factory-eod-operation.cjs');

function context(){
  const signal={signalId:'signal-anonymous-19',classification:'MISSED_RISK',observation:'An undetected validation Shape failure occurred while the existing test suite passed.'};
  const evidence=[
    {signalId:signal.signalId,evidenceId:'proof-a',role:'provenance',sourceId:'run-a',outcome:'supports',verified:true,independent:true},
    {signalId:signal.signalId,evidenceId:'proof-b',role:'reproduction',sourceId:'run-b',outcome:'supports',verified:true,independent:true},
    {signalId:signal.signalId,evidenceId:'proof-c',role:'control',sourceId:'run-c',outcome:'supports',verified:true,independent:true}
  ];
  const baseline={nodes:['entry','decision','relay','guard-one','side','guard-two'],checks:['guard-one','guard-two'],edges:[
    {from:'entry',to:'decision'},{from:'decision',to:'relay'},{from:'relay',to:'guard-one'},
    {from:'entry',to:'side'},{from:'side',to:'guard-two'}
  ]};
  const current={...baseline,edges:baseline.edges.filter(e=>!(e.from==='decision'&&e.to==='relay'))};
  return {signal,evidence,shape:{baseline,current},trace:{origin:'entry',suitePass:true,independentRiskConfirmed:true},remainingBudget:1};
}
function reviewsFor(input){
  const d=discoverTargets(input);
  assert.equal(d.state,'TARGET_CANDIDATE');
  const candidateId=d.candidates[0].candidateId;
  return ['C1-L1','C2-L2'].map((reviewerId,i)=>({reviewerId,reviewSourceId:'independent-audit-'+i,independent:true,verified:true,verdict:'PASS',candidateId,isolationPass:true,falsificationPass:true,controlPass:true}));
}
function ready(overrides={}){
  const input={...context(),...overrides};
  if(!Object.hasOwn(overrides,'targetReviews'))input.targetReviews=reviewsFor(input);
  return input;
}
function addedEdge(recipe){return recipe.find(item=>item.kind==='edge-added');}

test('E5I-01 missing upstream Evidence produces no WHAT or HOW',()=>{
  const r=discoverOperations({...context(),evidence:[],remainingBudget:0});
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.operations.length,0);assert.equal(r.releaseBlocked,true);
});

test('E5I-02 absent independent Target audit is not permission to propose HOW',()=>{
  const r=discoverOperations({...context(),targetReviews:[]});
  assert.equal(r.state,'BLOCK_TARGET_REVIEW_PENDING');assert.equal(r.operations.length,0);
});

test('E5I-03 duplicate source or reviewer cannot masquerade as independent double check',()=>{
  const inp=ready();inp.targetReviews[1]={...inp.targetReviews[1],reviewSourceId:'independent-audit-0'};
  const r=discoverOperations(inp);assert.equal(r.state,'BLOCK_TARGET_REVIEW_PENDING');
});

test('E5I-04 independently reviewed WHAT yields a falsifiable ADD recipe, without operation hint',()=>{
  const inp=ready();
  assert.equal(inp.operationHint,undefined);
  const r=discoverOperations(inp);
  assert.equal(r.state,'OPERATION_CANDIDATE');assert.equal(r.operations.length,1);
  const op=r.operations[0];assert.equal(op.operationType,'ADD');
  assert.deepEqual(addedEdge(op.recipe),{kind:'edge-added',from:'decision',to:'relay'});
  assert.deepEqual(op.counterfactual.recoveredChecks,['guard-one']);
  assert.ok(op.falsificationTests.length>=3);assert.equal(op.status,'CANDIDATE_ONLY');
  assert.equal(r.autoApply,false);assert.equal(r.formalPromotion,false);assert.equal(r.requiresGate,true);
});

test('E5I-05 different anonymized topology yields different HOW recipe',()=>{
  const inp=context();const baseline={nodes:['new-entry','split','validate','proof','passive'],checks:['proof'],edges:[
    {from:'new-entry',to:'split'},{from:'split',to:'validate'},{from:'validate',to:'proof'},{from:'new-entry',to:'passive'}]};
  inp.shape={baseline,current:{...baseline,edges:baseline.edges.filter(e=>e.from!=='validate')}};
  inp.trace={origin:'new-entry',suitePass:true,independentRiskConfirmed:true};
  inp.targetReviews=reviewsFor(inp);
  const r=discoverOperations(inp);assert.equal(r.state,'OPERATION_CANDIDATE');
  assert.deepEqual(addedEdge(r.operations[0].recipe),{kind:'edge-added',from:'validate',to:'proof'});
});

test('E5I-06 dormant capability lacking fresh proof must not be bypassed by ADD',()=>{
  const inp=ready({dormantCapabilities:[{state:'DORMANT',axisId:'axis-17',relationship:{from:'decision',to:'relay'},evidenceIds:['old-proof']} ]});
  const r=discoverOperations(inp);assert.equal(r.state,'REQUEST_MORE');
  assert.equal(r.operations.length,0);assert.ok(r.requests.includes('obtain-new-independent-evidence-for-dormant-reactivation'));
});

test('E5I-07 new independent validated Evidence produces REACTIVATE_CANDIDATE, not automatic ACTIVE',()=>{
  const inp=ready({dormantCapabilities:[{state:'DORMANT',axisId:'axis-17',relationship:{from:'decision',to:'relay'},evidenceIds:['old-proof']}],
    reactivationEvidence:[{evidenceId:'fresh-proof',axisId:'axis-17',sourceId:'new-independent-venue',verified:true,independent:true,outcome:'detected'}]});
  const r=discoverOperations(inp);assert.equal(r.state,'OPERATION_CANDIDATE');
  assert.equal(r.operations[0].operationType,'REACTIVATE');
  assert.equal(r.operations[0].formalPromotion,false);assert.equal(r.operations[0].autoApply,false);
  assert.deepEqual(r.operations[0].sourceEvidenceIds,['fresh-proof']);
});

test('E5I-08 Gate-approved stable Shape permits RESTORE only as candidate when direct mutation forbidden',()=>{
  const inp=ready({policy:{directGraphMutationAllowed:false},stableShape:{graph:context().shape.baseline,gateApproved:true,shapeId:'last-stable-6'}});
  const r=discoverOperations(inp);assert.equal(r.state,'OPERATION_CANDIDATE');
  assert.equal(r.operations[0].operationType,'RESTORE');assert.equal(r.operations[0].targetShapeId,'last-stable-6');
  assert.equal(r.operations[0].autoRollback,false);
});

test('E5I-09 unapproved historical graph cannot authorize RESTORE',()=>{
  const inp=ready({policy:{directGraphMutationAllowed:false},stableShape:{graph:context().shape.baseline,gateApproved:false,shapeId:'unapproved'}});
  const r=discoverOperations(inp);assert.equal(r.state,'REQUEST_MORE');assert.equal(r.operations.length,0);
});

test('E5I-10 multiple valid HOW proposals remain ambiguous, not arbitrarily selected',()=>{
  const inp=ready({stableShape:{graph:context().shape.baseline,gateApproved:true,shapeId:'last-stable'}});
  const r=discoverOperations(inp);assert.equal(r.state,'OPERATION_AMBIGUOUS');
  assert.equal(r.operations.length,0);assert.deepEqual(r.possibleOperations.map(o=>o.operationType).sort(),['ADD','RESTORE']);
});

test('E5I-11 upstream weak supporting Evidence cannot produce HOW',()=>{
  const inp=ready();inp.evidence=inp.evidence.slice(0,1);delete inp.targetReviews;
  const r=discoverOperations({...inp,targetReviews:[],remainingBudget:0});
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.operations.length,0);
});

test('E5I-12 a graph without lost reachability cannot be assigned a HOW',()=>{
  const inp=context();inp.shape={baseline:inp.shape.baseline,current:inp.shape.baseline};
  const r=discoverOperations({...inp,targetReviews:[]});assert.equal(r.state,'REQUEST_MORE');assert.equal(r.operations.length,0);
});

test('E5I-13 deterministic, data-only output and unmutated input',()=>{
  const inp=ready();const before=JSON.stringify(inp);
  const a=discoverOperations(inp),b=discoverOperations(inp);
  assert.deepEqual(a,b);assert.equal(JSON.stringify(inp),before);
  assert.equal(a.operations[0].autoApply,false);assert.equal(a.operations[0].execute,undefined);
});

test('E5I-14 a negative independent Target review rejects operation discovery',()=>{
  const inp=ready();inp.targetReviews[1].verdict='FAIL';
  const r=discoverOperations(inp);assert.equal(r.state,'BLOCK_TARGET_REJECTED');assert.equal(r.operations.length,0);
});

test('E5I-15 exhausted budget without approved operation freezes the problem',()=>{
  const inp=ready({remainingBudget:0,policy:{directGraphMutationAllowed:false}});
  const r=discoverOperations(inp);assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.operations.length,0);
  assert.equal(r.freezeRecord.recordKind,'problem');assert.equal(r.freezeRecord.autoResume,false);
});

test('E5I-16 severe missed risk keeps release BLOCKED despite a candidate',()=>{
  const r=discoverOperations(ready());assert.equal(r.releaseBlocked,true);
  assert.equal(r.operations[0].releaseBlocked,true);assert.equal(r.operations[0].requiresIndependentReview,true);
});

test('E5I-17 RESTORE that sacrifices a healthy guard is rejected by counterfactual checks',()=>{
  const inp=context();const broken=structuredClone(inp.shape.baseline);
  broken.edges=broken.edges.filter(e=>!(e.from==='side'&&e.to==='guard-two'));
  const r=discoverOperations(ready({stableShape:{graph:broken,gateApproved:true,shapeId:'misleading'},policy:{directGraphMutationAllowed:false}}));
  assert.equal(r.state,'REQUEST_MORE');assert.equal(r.operations.length,0);
});

test('E5I-18 duplicated, unverified or unrelated reactivation proof cannot trigger REACTIVATE',()=>{
  const dormantCapabilities=[{state:'DORMANT',axisId:'axis-17',relationship:{from:'decision',to:'relay'},evidenceIds:['old-proof']}];
  for(const ev of [
    {evidenceId:'old-proof',axisId:'axis-17',sourceId:'new',verified:true,independent:true,outcome:'detected'},
    {evidenceId:'fresh',axisId:'axis-17',sourceId:'new',verified:false,independent:true,outcome:'detected'},
    {evidenceId:'fresh',axisId:'other',sourceId:'new',verified:true,independent:true,outcome:'detected'},
    {evidenceId:'fresh',axisId:'axis-17',sourceId:'new',verified:true,independent:true,outcome:'validated'}
  ]){
    const r=discoverOperations(ready({dormantCapabilities,reactivationEvidence:[ev]}));
    assert.equal(r.state,'REQUEST_MORE');assert.equal(r.operations.length,0);
  }
});

// Safety addendum (E5I-19/20): added after the frozen 18-antibody run
// because mutation M3 exposed a non-detecting test. Do not rewrite RED history.
test('E5I-19 direct counterfactual guard forbids trading a healthy check for a restored risk check',()=>{
  const {counterfactualCandidate}=require('./ai-factory-eod-operation.cjs');
  const inp=ready();
  const target=discoverTargets(inp).candidates[0];
  const current=inp.shape.current;
  const patched={...current,edges:current.edges
    .filter(edge=>!(edge.from==='side'&&edge.to==='guard-two'))
    .concat([{from:'decision',to:'relay'}])};
  assert.equal(counterfactualCandidate(current,patched,inp.trace.origin,target),null);
});

test('E5I-20 a claimed but unverified independent reviewer cannot pass Target Gate',()=>{
  const inp=ready();inp.targetReviews[1].verified=false;
  const r=discoverOperations(inp);
  assert.equal(r.state,'BLOCK_TARGET_REVIEW_PENDING');assert.equal(r.operations.length,0);
});
