'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

let lifecycle={};
try{
  lifecycle=require('./ai-factory-dormant-lifecycle.cjs');
}catch(error){
  lifecycle={__loadError:error};
}

function requireFn(name){
  assert.equal(
    typeof lifecycle[name],
    'function',
    lifecycle.__loadError
      ? `missing ${name}; lifecycle module load failed: ${lifecycle.__loadError.message}`
      : `missing lifecycle function: ${name}`
  );
  return lifecycle[name];
}

const axis=Object.freeze({
  axisId:'example.new-axis',
  status:'validated-limited',
  evidenceIds:['E1','E2']
});

const stableShape=Object.freeze({
  shapeId:'shape-stable-10',
  activeAxes:['change.diff-purity','example.new-axis'],
  gate:'PASS'
});

test('P7-E5-F-A1 正しいが現在効果の低いNEW軸はEvidenceを失わずDORMANTへ移行できる',()=>{
  const toDormant=requireFn('transitionToDormant');
  const result=toDormant(axis,{
    correctnessPass:true,
    currentEffective:false,
    reason:'low-current-effectiveness'
  },stableShape);

  assert.equal(result.state,'DORMANT');
  assert.equal(result.axisId,'example.new-axis');
  assert.deepEqual(result.evidenceIds,['E1','E2']);
  assert.equal(result.deleted,false);
});

test('P7-E5-F-A2 DORMANT軸はactive Shapeの継承対象から外れるが履歴には残る',()=>{
  const toDormant=requireFn('transitionToDormant');
  const result=toDormant(axis,{
    correctnessPass:true,
    currentEffective:false
  },stableShape);

  assert.ok(!result.nextShape.activeAxes.includes('example.new-axis'));
  assert.ok(result.history.some(h=>h.axisId==='example.new-axis' && h.state==='DORMANT'));
});

test('P7-E5-F-A3 新しい独立EvidenceはREACTIVATE_CANDIDATEを作るが直接FORMALにはしない',()=>{
  const propose=requireFn('proposeReactivation');
  const dormantRecord={
    axisId:'example.new-axis',
    state:'DORMANT',
    evidenceIds:['E1','E2']
  };
  const result=propose(dormantRecord,{
    evidenceId:'E3',
    independent:true,
    outcome:'detected'
  });

  assert.equal(result.state,'REACTIVATE_CANDIDATE');
  assert.equal(result.formal,false);
  assert.equal(result.experimentalInheritance,true);
  assert.ok(result.evidenceIds.includes('E3'));
});

test('P7-E5-F-A4 再活性化後の悪化はSHAPE_RESTORE_CANDIDATEを生成し自動rollbackしない',()=>{
  const evaluate=requireFn('evaluateReactivation');
  const result=evaluate({
    candidate:{axisId:'example.new-axis',state:'REACTIVATE_CANDIDATE'},
    beforeShape:stableShape,
    afterMetrics:{
      missedRisk:1,
      falseBlock:0,
      regressionBreakage:1,
      validationCostDeltaMs:25
    }
  });

  assert.equal(result.state,'SHAPE_RESTORE_CANDIDATE');
  assert.equal(result.autoRollback,false);
});

test('P7-E5-F-A5 Shape Memory αの復元候補は安定Shapeへ戻しつつ新しい失敗Evidenceを保持する',()=>{
  const restore=requireFn('createRestoreCandidate');
  const result=restore(stableShape,{
    evidenceId:'E-FAIL-1',
    classification:'reactivation-regression'
  });

  assert.equal(result.targetShapeId,'shape-stable-10');
  assert.equal(result.requiresGate,true);
  assert.equal(result.autoRollback,false);
  assert.ok(result.preservedEvidence.includes('E-FAIL-1'));
});

test('P7-E5-F-A6 軸休眠で検出力を維持しMissed Riskを増やさずコストかFalse BLOCKが下がれば逆方向進化候補になる',()=>{
  const evaluate=requireFn('evaluateReverseEvolution');
  const result=evaluate({
    before:{
      additionalDetection:4,
      missedRisk:0,
      falseBlock:3,
      validationCostMs:120
    },
    after:{
      additionalDetection:4,
      missedRisk:0,
      falseBlock:1,
      validationCostMs:80
    }
  });

  assert.equal(result.state,'REVERSE_EVOLUTION_CANDIDATE');
  assert.equal(result.promoted,false);
  assert.equal(result.requiresDoubleCheck,true);
});
