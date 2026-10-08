'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {discoverEvolutionStones}=require('./ai-factory-stone-recombine.cjs');
const {auditStone}=require('./ai-factory-stone-ninja.cjs');
function f(id,signal,project,source,path,extra={}){return {evidenceId:id,signalId:signal,projectId:project,sourceId:source,signature:'gap-struct',observedPath:path,verified:true,independent:true,outcome:'supports',...extra};}
const a=f('a','s-a','p-a','src-a',['input','boundary','bridge']);
const b=f('b','s-b','p-b','src-b',['boundary','bridge','check']);
function cand(){return discoverEvolutionStones({evidence:[a,b]}).candidates[0];}

test('E5J-N1 separate audit validates structure only, never authorizes promotion',()=>{
  const r=auditStone(cand(),[a,b]);assert.equal(r.state,'VALIDATED_LIMITED');
  assert.equal(r.structuralReviewPass,true);assert.equal(r.causalProof,false);assert.equal(r.formalPromotion,false);assert.equal(r.autoApply,false);assert.equal(r.requiresGate,true);
});
test('E5J-N2 negative-control evidence matching joined chain produces FALSE_STONE',()=>{
  const negative=f('ctrl','s-ctrl','p-ctrl','src-c',['input','boundary','bridge','check'],{outcome:'control-refutes'});
  const r=auditStone(cand(),[a,b,negative]);assert.equal(r.state,'FALSE_STONE');assert.ok(r.rejectReasons.includes('counterexample-to-joined-path'));
});
test('E5J-N3 verified contradictory Evidence for actual joined section produces FALSE_STONE',()=>{
  const conflict=f('cf','s-cf','p-cf','src-c',['boundary','bridge','check'],{outcome:'contradicts'});
  const r=auditStone(cand(),[a,b,conflict]);assert.equal(r.state,'FALSE_STONE');
});
test('E5J-N4 unverified negative control does not get treated as proof of contradiction',()=>{
  const weak=f('ctrl','s-cf','p-cf','src-c',['input','boundary','bridge','check'],{outcome:'control-refutes',verified:false});
  assert.equal(auditStone(cand(),[a,b,weak]).state,'VALIDATED_LIMITED');
});
test('E5J-N5 tampered Stone mergedPath or fragment IDs are rejected',()=>{
  const s=cand();assert.equal(auditStone({...s,mergedPath:['input','random','check']},[a,b]).state,'FALSE_STONE');
  assert.equal(auditStone({...s,fragmentIds:['a','fake']},[a,b]).state,'FALSE_STONE');
});
test('E5J-N6 relabelled source metadata in raw Evidence fails independent source requirement',()=>{
  const fake={...b,sourceId:'src-a'};assert.equal(auditStone(cand(),[a,fake]).state,'FALSE_STONE');
});
test('E5J-N7 self-approval flags on candidate are forbidden even with valid structure',()=>{
  assert.equal(auditStone({...cand(),autoApply:true},[a,b]).state,'FALSE_STONE');
  assert.equal(auditStone({...cand(),formalPromotion:true},[a,b]).state,'FALSE_STONE');
});
test('E5J-N8 unrelated contradictory signal does not produce a false stop',()=>{
  const x=f('x','sx','px','src-x',['x','y','z'],{outcome:'contradicts'});
  assert.equal(auditStone(cand(),[a,b,x]).state,'VALIDATED_LIMITED');
});
test('E5J-N9 audit outcome invariant to raw Evidence order',()=>{
  assert.deepEqual(auditStone(cand(),[a,b]),auditStone(cand(),[b,a]));
});
test('E5J-N10 a fake Stone with no evidence pair cannot pass',()=>{
  assert.equal(auditStone({...cand(),fragmentIds:['missing-a','missing-b']},[]).state,'FALSE_STONE');
});
test('E5J-N11 forged or missing Stone identity must fail provenance audit',()=>{
  assert.equal(auditStone({...cand(),stoneId:'stone-forged'},[a,b]).state,'FALSE_STONE');
  assert.equal(auditStone({...cand(),stoneId:null},[a,b]).state,'FALSE_STONE');
});
test('E5J-N12 bypassing independent review requirement invalidates the Stone',()=>{
  assert.equal(auditStone({...cand(),requiresIndependentReview:false},[a,b]).state,'FALSE_STONE');
});
test('E5J-N13 re-labeling Candidate as PROMOTED must not pass independent audit',()=>{
  assert.equal(auditStone({...cand(),status:'PROMOTED'},[a,b]).state,'FALSE_STONE');
});
