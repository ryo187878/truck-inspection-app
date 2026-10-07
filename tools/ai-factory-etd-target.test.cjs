'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverTargets}=require('./ai-factory-etd-target.cjs');
const {inspectEvidence}=require('./ai-factory-evidence-sufficiency.cjs');

const signal=()=>({signalId:'signal-19',observation:'A deliberately modified validation Shape produced an undetected risk under a passing suite.',classification:'MISSED_RISK'});
function evidence(sid='signal-19'){
  return [
    {signalId:sid,evidenceId:'pr-a',role:'provenance',sourceId:'probe-a',outcome:'supports',verified:true,independent:true},
    {signalId:sid,evidenceId:'rep-b',role:'reproduction',sourceId:'probe-b',outcome:'supports',verified:true,independent:true},
    {signalId:sid,evidenceId:'ctl-c',role:'control',sourceId:'probe-c',outcome:'supports',verified:true,independent:true}
  ];
}
function shape(){
  const base={nodes:['input','selector','bridge','check-alpha','support','check-beta'],checks:['check-alpha','check-beta'],edges:[
    {from:'input',to:'selector'},{from:'selector',to:'bridge'},
    {from:'bridge',to:'check-alpha'},
    {from:'input',to:'support'},{from:'support',to:'check-beta'}
  ]};
  const current={...base,edges:base.edges.filter(x=>!(x.from==='selector' && x.to==='bridge'))};
  return {baseline:base,current};
}
function input(overrides={}){
  return {signal:signal(),evidence:evidence(),shape:shape(),trace:{origin:'input',suitePass:true,independentRiskConfirmed:true},remainingBudget:1,...overrides};
}

test('E5H-01 insufficient redacted E5-D-like signal cannot invent Target',()=>{
  const r=discoverTargets({signal:signal(),evidence:[],trace:{suitePass:true,independentRiskConfirmed:true},remainingBudget:0});
  assert.equal(r.state,'EVIDENCE_FREEZE'); assert.equal(r.candidates.length,0);assert.equal(r.releaseBlocked,true);
});

test('E5H-02 evidence can be sufficient yet a missing Shape contrast requires specific request',()=>{
  const r=discoverTargets(input({shape:undefined}));
  assert.equal(r.state,'REQUEST_MORE');assert.deepEqual(r.requests,['obtain-before-after-validation-shape']);assert.equal(r.candidates.length,0);
});

test('E5H-03 discover unnamed target from a path-breaking Shape contrast',()=>{
  const r=discoverTargets(input());
  assert.equal(r.state,'TARGET_CANDIDATE');assert.equal(r.candidates.length,1);
  assert.deepEqual(r.candidates[0].relationship,{from:'selector',to:'bridge'});
  assert.ok(r.candidates[0].provenance.length>=3);
  assert.ok(r.candidates[0].falsificationTests.length>=2);
  assert.equal(r.candidates[0].kind,'validation-reachability-loss');
  assert.equal(r.candidates[0].operation,undefined);
  assert.equal(r.formalPromotion,false);assert.equal(r.requiresIndependentReview,true);assert.equal(r.releaseBlocked,true);
});

test('E5H-04 identify a different target under a new anonymized topology',()=>{
  const base={nodes:['evt','route','scan','assert','fallback'],checks:['assert'],edges:[
    {from:'evt',to:'route'},{from:'route',to:'scan'},{from:'scan',to:'assert'},{from:'evt',to:'fallback'}
  ]};
  const current={...base,edges:base.edges.filter(x=>x.from!=='scan')};
  const r=discoverTargets(input({shape:{baseline:base,current},trace:{origin:'evt',suitePass:true,independentRiskConfirmed:true}}));
  assert.equal(r.state,'TARGET_CANDIDATE');assert.deepEqual(r.candidates[0].relationship,{from:'scan',to:'assert'});
});

test('E5H-05 identical graphs do not justify a specific target',()=>{
  const {baseline}=shape();const r=discoverTargets(input({shape:{baseline,current:baseline}}));
  assert.equal(r.state,'REQUEST_MORE');assert.equal(r.candidates.length,0);
});

test('E5H-06 unrelated removed branch with no check reachability effect does not justify target',()=>{
  const {baseline}=shape();
  const current={...baseline,edges:baseline.edges.filter(x=>!(x.from==='input'&&x.to==='support'))};
  // Here the removed edge affects check-beta, so declare the change origin below a different subtree.
  const r=discoverTargets(input({shape:{baseline,current},trace:{origin:'selector',suitePass:true,independentRiskConfirmed:true}}));
  assert.equal(r.state,'REQUEST_MORE');assert.equal(r.candidates.length,0);
});

test('E5H-07 alternative path preserving reachability blocks false target',()=>{
  const {baseline}=shape();
  baseline.edges.push({from:'selector',to:'check-alpha'});
  const current={...baseline,edges:baseline.edges.filter(x=>!(x.from==='selector'&&x.to==='bridge'))};
  const r=discoverTargets(input({shape:{baseline,current}}));
  assert.equal(r.state,'REQUEST_MORE');assert.equal(r.candidates.length,0);
});

test('E5H-08 two independent losses abstain rather than pick an arbitrary winner',()=>{
  const {baseline}=shape();
  const current={...baseline,edges:baseline.edges.filter(x=>!((x.from==='selector'&&x.to==='bridge')||(x.from==='support'&&x.to==='check-beta')))};
  const r=discoverTargets(input({shape:{baseline,current}}));
  assert.equal(r.state,'TARGET_AMBIGUOUS');assert.equal(r.candidates.length,0);
  assert.equal(r.possibleRelationships.length,2);assert.equal(r.requiresGate,true);
});

test('E5H-09 conflicting verified Evidence blocks targeting even for compelling graph diffs',()=>{
  const e=evidence();e.push({signalId:signal().signalId,evidenceId:'x-conflict',role:'control',sourceId:'probe-d',outcome:'contradicts',verified:true,independent:true});
  const r=discoverTargets(input({evidence:e,remainingBudget:0}));
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.candidates.length,0);
});

test('E5H-10 a single source cannot support target generation',()=>{
  const e=evidence().map(x=>({...x,sourceId:'same-source'}));
  const r=discoverTargets(input({evidence:e,remainingBudget:0}));
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.candidates.length,0);
});

test('E5H-11 an invalid graph is explicitly blocked, not inferred',()=>{
  const {baseline,current}=shape();current.edges.push({from:'ghost-node',to:'check-alpha'});
  const r=discoverTargets(input({shape:{baseline,current}}));
  assert.equal(r.state,'BLOCK_INVALID_SHAPE');assert.equal(r.candidates.length,0);
});

test('E5H-12 silent PASS without independent risk confirmation does not create target',()=>{
  const r=discoverTargets(input({trace:{origin:'input',suitePass:true,independentRiskConfirmed:false}}));
  assert.equal(r.state,'REQUEST_MORE');assert.equal(r.candidates.length,0);
});

test('E5H-13 results are deterministic and have no self-promotion authority',()=>{
  const a=discoverTargets(input()),b=discoverTargets(input());
  assert.deepEqual(a,b);assert.equal(a.autoChange,false);assert.equal(a.autoPromote,false);
  assert.equal(a.candidates[0].status,'CANDIDATE_ONLY');
});

test('E5H-14 wrong-signal Evidence cannot satisfy the Evidence gate',()=>{
  const r=discoverTargets(input({evidence:evidence('another-signal'),remainingBudget:0}));
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.candidates.length,0);
});

test('E5H-15 invalid baseline check reference blocks inference',()=>{
  const {baseline,current}=shape();baseline.checks.push('nonexistent-check');
  const r=discoverTargets(input({shape:{baseline,current}}));
  assert.equal(r.state,'BLOCK_INVALID_SHAPE');assert.equal(r.candidates.length,0);
});

test('E5H-16 E5G role-based gate itself remains validated',()=>{
  const r=inspectEvidence(signal(),evidence(),{remainingBudget:0});
  assert.equal(r.state,'ETD_ELIGIBLE');assert.equal(r.independentSourceCount,3);
});
