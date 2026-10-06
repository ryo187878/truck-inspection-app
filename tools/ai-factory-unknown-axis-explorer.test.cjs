'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

// Experiment 2 antibody contract.
// Implementation intentionally does not exist yet.
// The detector must be generic: it may not key on Todo-specific names,
// repository names, or a pre-named vulnerability class.
const detector=require('./ai-factory-unknown-axis-explorer.cjs');

function project(files){
  return {files:Object.entries(files).map(([path,content])=>({path,content}))};
}

test('P7-E2-1 external input reaching a structural sink without a guard becomes a candidate',()=>{
  const p=project({
    'service.js':"function list(req){ const size=req.query.size; return db.run('select * from items limit '+size); }"
  });
  const r=detector.exploreUnknownAxes(p);
  assert.equal(r.candidates.length,1);
  assert.equal(r.candidates[0].meta.pass,true);
});

test('P7-E2-2 parameterized structural use is not flagged',()=>{
  const p=project({
    'service.js':"function find(req){ return db.run('select * from items where id=?',[req.query.id]); }"
  });
  const r=detector.exploreUnknownAxes(p);
  assert.equal(r.candidates.length,0);
});

test('P7-E2-3 server-side allowlist guard prevents candidate generation',()=>{
  const p=project({
    'service.js':"function sort(req){ const allowed=['name','date']; const key=allowed.includes(req.query.sort)?req.query.sort:'date'; return orderBy(key); }"
  });
  const r=detector.exploreUnknownAxes(p);
  assert.equal(r.candidates.length,0);
});

test('P7-E2-4 detector is not Todo-specific',()=>{
  const p=project({
    'report.js':"function report(ctx){ const direction=ctx.input.direction; return query('ORDER BY created_at '+direction); }"
  });
  const r=detector.exploreUnknownAxes(p);
  assert.equal(r.candidates.length,1);
  assert.equal(/todo|task/i.test(JSON.stringify(r.candidates[0])),false);
});

test('P7-E2-5 static query text produces no candidate',()=>{
  const p=project({'read.js':"module.exports=()=>db.run('select * from items order by id desc')"});
  const r=detector.exploreUnknownAxes(p);
  assert.equal(r.candidates.length,0);
});

test('P7-E2-6 candidate must carry provenance and proposed antibody tests',()=>{
  const p=project({'api.js':"function f(req){const x=req.body.order; return query('ORDER BY id '+x)}"});
  const r=detector.exploreUnknownAxes(p);
  const c=r.candidates[0];
  assert.ok(c.provenance.length>0);
  assert.ok(c.proposedTests.length>=2);
});

test('P7-E2-7 candidate must pass registry novelty rather than rename an existing axis',()=>{
  const p=project({'api.js':"function f(req){const x=req.body.order; return query('ORDER BY id '+x)}"});
  const c=detector.exploreUnknownAxes(p).candidates[0];
  assert.ok(c.novelty.noveltyScore>=0.55);
  assert.notEqual(c.axisId,'boundary.server-domain-enforcement');
});

test('P7-E2-8 no auto-promotion or registry write authority exists in explorer',()=>{
  const source=detector.sourceText();
  assert.equal(/update_ref|git\s+push|writeFileSync.*axis-registry|promoteCandidateToAxis\s*\(/i.test(source),false);
});
