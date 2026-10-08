'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverEvolutionStones}=require('./ai-factory-stone-recombine.cjs');
const {inspectEvidence,proposeProblemReactivation}=require('./ai-factory-evidence-sufficiency.cjs');
function f(id,signal,project,source,path,extra={}){return {evidenceId:id,signalId:signal,projectId:project,sourceId:source,signature:'blind-validation-gap',observedPath:path,verified:true,independent:true,outcome:'supports',...extra};}
const a=()=>f('A1','sig-A','app-A','src-A',['origin','relay','junction']);
const b=()=>f('B1','sig-B','app-B','src-B',['relay','junction','guard']);
function run(items,opt={}){return discoverEvolutionStones({evidence:items,remainingBudget:0,...opt});}

test('E5J-01 distinct problems/projects combine into one inspectable unprompted Stone candidate',()=>{
  const r=run([a(),b()]); assert.equal(r.state,'STONE_CANDIDATES');assert.equal(r.candidates.length,1);
  const s=r.candidates[0];assert.deepEqual(s.mergedPath,['origin','relay','junction','guard']);
  assert.deepEqual(s.fragmentIds,['A1','B1']); assert.equal(s.kind,'EVOLUTION_STONE_CANDIDATE');
  assert.equal(s.autoApply,false); assert.equal(s.formalPromotion,false);assert.equal(s.requiresGate,true);
});
test('E5J-02 each fragment alone cannot imply the merged path and requests more evidence',()=>{
  for(const fragment of [a(),b()]){const r=run([fragment],{remainingBudget:2});assert.equal(r.state,'REQUEST_MORE');assert.equal(r.candidates.length,0);}
});
test('E5J-03 missing evidence with exhausted budget freezes problem and persists missing query',()=>{
  const r=run([a()],{signal:{signalId:'sig-Root',classification:'MISSED_RISK'}});
  assert.equal(r.state,'EVIDENCE_FREEZE');assert.equal(r.freezeRecord.recordKind,'problem');assert.equal(r.releaseBlocked,true);
  assert.equal(r.freezeRecord.autoResume,false);assert.ok(r.freezeRecord.requests.length);
});
test('E5J-04 shuffled Evidence yields bit-identical deterministic candidate',()=>{
  assert.deepEqual(run([b(),a()]),run([a(),b()]));
});
test('E5J-05 unrelated path or non-contiguous matching words never produces Stone',()=>{
  const x=f('X1','sig-X','app-X','src-X',['x','z','q']);
  const y=f('Y1','sig-Y','app-Y','src-Y',['junction','else','relay','guard']);
  assert.equal(run([a(),x]).candidates.length,0);assert.equal(run([a(),y]).candidates.length,0);
});
test('E5J-06 same provenance source never counts as independent cross-project',()=>{
  assert.equal(run([a(),f('B1','sig-B','app-B','src-A',['relay','junction','guard'])]).candidates.length,0);
});
test('E5J-07 same app/project or same signal cannot create cross-context corroboration',()=>{
  assert.equal(run([a(),f('B1','sig-B','app-A','src-B',['relay','junction','guard'])]).candidates.length,0);
  assert.equal(run([a(),f('B1','sig-A','app-B','src-B',['relay','junction','guard'])]).candidates.length,0);
});
test('E5J-08 unverified or dependent fragment is excluded even when path fits',()=>{
  for(const extra of [{verified:false},{independent:false}])assert.equal(run([a(),bWith(extra)]).candidates.length,0);
});
function bWith(extra){return {...b(),...extra};}
test('E5J-09 different signatures do not silently cross-associate',()=>{
  assert.equal(run([a(),bWith({signature:'unrelated-signature'})]).candidates.length,0);
});
test('E5J-10 only one shared node or suffix mismatches prefix cannot invent a chain',()=>{
  const weak=f('B1','sig-B','app-B','src-B',['junction','guard','end']);
  const wrong=f('B2','sig-C','app-C','src-C',['relay','guard','junction']);
  assert.equal(run([a(),weak]).candidates.length,0);assert.equal(run([a(),wrong]).candidates.length,0);
});
test('E5J-11 cycle-looking joined path is rejected, not rationalized into a Stone',()=>{
  const cycle=f('B1','sig-B','app-B','src-B',['relay','junction','origin']);
  assert.equal(run([a(),cycle]).candidates.length,0);
});
test('E5J-12 duplicates of the same evidenceId produce BLOCK_INVALID_INPUT',()=>{
  const r=run([a(),a(),b()]);assert.equal(r.state,'BLOCK_INVALID_INPUT');assert.equal(r.candidates.length,0);
});
test('E5J-13 mixed irrelevant Evidence never changes the correct pairing',()=>{
  const noise=Array.from({length:40},(_,i)=>f(`N${i}`,`s-${i}`,`pr-${i}`,`source-${i}`,[`p-${i}`,`q-${i}`,`r-${i}`]));
  const r=run([a(),b(),...noise],{maxPairs:10000});assert.equal(r.candidates.length,1);
  assert.deepEqual(r.candidates[0].fragmentIds,['A1','B1']);
});
test('E5J-14 finite pair budget reports INSUFFICIENT_BUDGET even when one candidate is found',()=>{
  const r=run([a(),b(),f('C1','sig-C','app-C','src-C',['q','r','t'])],{maxPairs:1});
  assert.equal(r.state,'INSUFFICIENT_BUDGET');assert.equal(r.truncated,true);assert.equal(r.candidates.length,1);
});
test('E5J-15 proposer marks severe risk as release-blocking, even with Stone hypothesis',()=>{
  const r=run([a(),b()],{signal:{signalId:'sig-Root',classification:'MISSED_RISK'}});
  assert.equal(r.state,'STONE_CANDIDATES');assert.equal(r.releaseBlocked,true);assert.equal(r.candidates[0].releaseBlocked,true);
});
test('E5J-16 caller cannot inject a target name or operation to change structurally discovered Stone',()=>{
  const clean=run([a(),b()]); const injected=run([a(),b()],{targetName:'operator-chosen-fix',operation:'PROMOTE',formalPromotion:true});
  assert.deepEqual(clean,injected);
});
test('E5J-17 Stone alone cannot bypass E5G frozen-task reactivation',()=>{
  const signal={signalId:'real-task',observation:'silent validation pass',classification:'MISSED_RISK'};
  const old=[{signalId:'real-task',evidenceId:'P',role:'provenance',sourceId:'s1',verified:true,independent:true,outcome:'supports'}];
  const frozen=inspectEvidence(signal,old,{remainingBudget:0});assert.equal(frozen.state,'EVIDENCE_FREEZE');
  const fakeStoneAsNewEvidence={signalId:'real-task',evidenceId:'stone-1',role:'control',sourceId:'stone-generator',verified:false,independent:true,outcome:'supports'};
  const re=proposeProblemReactivation(frozen,old,[fakeStoneAsNewEvidence]);assert.equal(re.state,'EVIDENCE_FREEZE');
});
test('E5J-18 meaningful independent third-source Evidence may propose problem reactivation but never auto-resume',()=>{
  const signal={signalId:'real-task',observation:'unknown gap',classification:'MISSED_RISK'};
  const old=[
    {signalId:'real-task',evidenceId:'P',role:'provenance',sourceId:'s1',verified:true,independent:true,outcome:'supports'},
    {signalId:'real-task',evidenceId:'R',role:'reproduction',sourceId:'s2',verified:true,independent:true,outcome:'supports'}
  ];
  const frozen=inspectEvidence(signal,old,{remainingBudget:0});assert.equal(frozen.state,'EVIDENCE_FREEZE');
  const ctrl={signalId:'real-task',evidenceId:'C',role:'control',sourceId:'s3',verified:true,independent:true,outcome:'supports'};
  const r=proposeProblemReactivation(frozen,old,[ctrl]);assert.equal(r.state,'REACTIVATE_CANDIDATE');assert.equal(r.autoResume,false);assert.equal(r.formalPromotion,false);
});
test('E5J-19 candidate is an exploration hint, not an E5H Target or an E5I executable Operation',()=>{
  const {discoverTargets}=require('./ai-factory-etd-target.cjs');const {discoverOperations}=require('./ai-factory-eod-operation.cjs');
  const stones=run([a(),b()]);const signal={signalId:'real-task',observation:'silent validation pass',classification:'MISSED_RISK'};
  const etd=discoverTargets({signal,evidence:[],stoneCandidates:stones.candidates,remainingBudget:0});
  const eod=discoverOperations({signal,evidence:[],stoneCandidates:stones.candidates,remainingBudget:0});
  assert.equal(etd.candidates.length,0);assert.equal(eod.operations.length,0);assert.equal(etd.releaseBlocked,true);assert.equal(eod.releaseBlocked,true);
});
