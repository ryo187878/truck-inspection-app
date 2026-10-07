'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');

const generator=require('./ai-factory-generate-axis.cjs');
const explorer=require('./ai-factory-unknown-axis-explorer.cjs');

function fixture(files){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ai-factory-e5d-'));
  for(const [name,content] of Object.entries(files)){
    const full=path.join(root,name);
    fs.mkdirSync(path.dirname(full),{recursive:true});
    fs.writeFileSync(full,content);
  }
  return root;
}

test('P7-E5-D baseline: redacted missed-risk Evidence is handled by current generators without hidden hints',()=>{
  const redactedEvidence={
    experiment:'P7-E5-D-BASELINE',
    classification:'MISSED_RISK',
    blindRun:{tests:165,pass:165,fail:0,silentPass:true},
    observation:'A deliberately introduced validation-structure mutation passed the full existing suite undetected.',
    targetIdentifiersRedacted:true
  };

  const root=fixture({
    'missed-risk-evidence.cjs':"'use strict';\nmodule.exports="+JSON.stringify(redactedEvidence,null,2)+";\n"
  });

  const generated=generator.generateAxisCandidates(root,{generation:91});
  const explored=explorer.exploreUnknownAxes(generator.loadProject(root));

  const result={
    generatorCandidates:generated.candidates.map(c=>({
      axisId:c.axisId,
      meta:c.meta,
      provenance:c.provenance,
      proposedTests:c.proposedTests
    })),
    explorerCandidates:(explored.candidates||[]).map(c=>({
      axisId:c.axisId,
      meta:c.meta,
      provenance:c.provenance,
      proposedTests:c.proposedTests
    }))
  };

  console.log('P7-E5-D-BASELINE '+JSON.stringify(result,null,2));

  // Baseline expectation records current behavior. It is not a desired future behavior.
  assert.deepEqual(result.generatorCandidates,[]);
  assert.deepEqual(result.explorerCandidates,[]);
});
