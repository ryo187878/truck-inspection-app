'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const {EVIDENCE_LEDGER,validateLedger}=require('./ai-factory-evidence-ledger.cjs');
const scorer=require('./ai-factory-score-axes.cjs');

function event(overrides={}){
  return {
    evidenceId:'E-'+Math.random().toString(16).slice(2),
    axisId:'change.diff-purity',
    generation:61,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:90,
    residualRisk:10,
    executionCostMs:500,
    source:'synthetic antibody fixture',
    ...overrides
  };
}

test('G61 軸レジストリとEvidence台帳は機械可読かつ整合する',()=>{
  assert.equal(validateRegistry().pass,true);
  const result=validateLedger();
  assert.equal(result.pass,true,result.issues.join(', '));
  assert.ok(AXIS_BY_ID.has('axis.effectiveness-scoring'));
});

test('G62 スコアは0〜100で決定的に算出される',()=>{
  const a=scorer.scoreAxis('promotion.shared-dna');
  const b=scorer.scoreAxis('promotion.shared-dna');
  assert.deepEqual(a,b);
  assert.ok(a.score>=0&&a.score<=100);
});

test('G63 実際に問題を止めたEvidenceは同条件のvalidatedだけより高く評価される',()=>{
  const detected=[
    event({evidenceId:'D1',outcome:'detected',issueCount:2}),
    event({evidenceId:'D2',outcome:'validated'})
  ];
  const safe=[
    event({evidenceId:'S1',outcome:'validated'}),
    event({evidenceId:'S2',outcome:'validated'})
  ];
  assert.ok(
    scorer.scoreAxis('change.diff-purity',detected).score >
    scorer.scoreAxis('change.diff-purity',safe).score
  );
});

test('G64 false positiveは有効度を下げる',()=>{
  const clean=[event({evidenceId:'C1'}),event({evidenceId:'C2'})];
  const noisy=[
    event({evidenceId:'N1'}),
    event({evidenceId:'N2',outcome:'false-positive',evidenceStrength:50})
  ];
  assert.ok(
    scorer.scoreAxis('change.diff-purity',noisy).score <
    scorer.scoreAxis('change.diff-purity',clean).score
  );
});

test('G65 missed riskがある軸は自動継承eligibleにならない',()=>{
  const events=[
    event({evidenceId:'M1'}),
    event({evidenceId:'M2',outcome:'missed-risk',evidenceStrength:20,residualRisk:90})
  ];
  const result=scorer.scoreAxis('change.diff-purity',events);
  assert.equal(result.eligible,false);
  assert.equal(result.missedRiskCount,1);
});

test('G66 実測コストが高い場合は同じEvidenceでもスコアが下がる',()=>{
  const cheap=[
    event({evidenceId:'L1',executionCostMs:100}),
    event({evidenceId:'L2',executionCostMs:100})
  ];
  const costly=[
    event({evidenceId:'H1',executionCostMs:1900}),
    event({evidenceId:'H2',executionCostMs:1900})
  ];
  assert.ok(
    scorer.scoreAxis('change.diff-purity',cheap).score >
    scorer.scoreAxis('change.diff-purity',costly).score
  );
});

test('G67 Evidenceが1件しかない軸は高スコアでも自動継承しない',()=>{
  const one=[event({evidenceId:'ONE',outcome:'detected',issueCount:5,evidenceStrength:100,residualRisk:0})];
  const row=scorer.scoreAxis('change.diff-purity',one);
  assert.equal(row.eventCount,1);
  assert.equal(row.eligible,false);
});

test('G68 過去Evidenceから有効軸をランキングし最低1軸を選べる',()=>{
  const result=scorer.selectEffectiveInheritedAxes([
    'change.diff-purity',
    'dispatch.branch-normalization',
    'promotion.shared-dna',
    'auth.context-isolation',
    'impact.test-selection'
  ]);
  assert.equal(result.fallback,false);
  assert.ok(result.selected.length>=1);
  assert.ok(result.ranked[0].score>=result.ranked.at(-1).score);
});

test('G69 Evidence不足なら候補を勝手に削らず安全側に全保持する',()=>{
  const weak=[event({evidenceId:'W1',axisId:'tenant.isolation',evidenceStrength:80})];
  const result=scorer.selectEffectiveInheritedAxes(
    ['tenant.isolation'],
    weak,
    {minEvidenceEvents:2,minCount:1}
  );
  assert.equal(result.fallback,true);
  assert.deepEqual(result.selected,['tenant.isolation']);
});

test('G70 有効度選択は現在変更のimpact test selectionを置換しない',()=>{
  const source=require('node:fs').readFileSync(require('node:path').join(__dirname,'ai-factory-score-axes.cjs'),'utf8');
  assert.equal(source.includes("require('./ai-factory-select-tests.cjs')"),false);
  assert.match(source,/Safety rule: insufficient Evidence never means "drop the axis"/);
});

test('実台帳では優先度1〜4の主要軸に2件以上のEvidenceがある',()=>{
  for(const id of [
    'change.diff-purity',
    'dispatch.branch-normalization',
    'promotion.shared-dna',
    'auth.context-isolation',
    'impact.test-selection'
  ]){
    const row=scorer.scoreAxis(id,EVIDENCE_LEDGER);
    assert.ok(row.eventCount>=2,id+' eventCount='+row.eventCount);
  }
});

test('axis.effectiveness-scoringは優先度4以前の有効軸を継承している',()=>{
  const axis=AXIS_BY_ID.get('axis.effectiveness-scoring');
  assert.equal(axis.generationIntroduced,61);
  assert.ok(axis.inheritedFrom.includes('impact.test-selection'));
  assert.ok(axis.inheritedFrom.includes('promotion.shared-dna'));
  assert.ok(axis.inheritedFrom.includes('auth.context-isolation'));
  assert.ok(axis.inheritedFrom.includes('change.diff-purity'));
});
