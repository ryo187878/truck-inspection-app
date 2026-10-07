'use strict';

function unique(values=[]){
  return [...new Set(values.filter(Boolean))];
}

function transitionToDormant(axis={},assessment={},stableShape={}){
  if(!assessment.correctnessPass){
    return {
      axisId:axis.axisId||null,
      state:'BLOCKED',
      reason:'correctness-not-confirmed',
      evidenceIds:[...(axis.evidenceIds||[])],
      deleted:false,
      nextShape:stableShape,
      history:[]
    };
  }

  if(assessment.currentEffective!==false){
    return {
      axisId:axis.axisId||null,
      state:'OBSERVE',
      reason:'still-effective-or-unknown',
      evidenceIds:[...(axis.evidenceIds||[])],
      deleted:false,
      nextShape:stableShape,
      history:[]
    };
  }

  const axisId=axis.axisId||null;
  const activeAxes=(stableShape.activeAxes||[]).filter(id=>id!==axisId);

  return {
    axisId,
    state:'DORMANT',
    reason:assessment.reason||'low-current-effectiveness',
    evidenceIds:[...(axis.evidenceIds||[])],
    deleted:false,
    nextShape:{
      ...stableShape,
      activeAxes
    },
    history:[{
      axisId,
      state:'DORMANT',
      sourceShapeId:stableShape.shapeId||null
    }]
  };
}

function proposeReactivation(dormantRecord={},newEvidence={}){
  const evidenceIds=unique([
    ...(dormantRecord.evidenceIds||[]),
    newEvidence.evidenceId
  ]);

  const eligible=
    dormantRecord.state==='DORMANT' &&
    newEvidence.independent===true &&
    newEvidence.outcome==='detected' &&
    Boolean(newEvidence.evidenceId);

  if(!eligible){
    return {
      axisId:dormantRecord.axisId||null,
      state:'DORMANT',
      formal:false,
      experimentalInheritance:false,
      evidenceIds,
      reason:'insufficient-independent-evidence'
    };
  }

  return {
    axisId:dormantRecord.axisId||null,
    state:'REACTIVATE_CANDIDATE',
    formal:false,
    experimentalInheritance:true,
    evidenceIds,
    reason:'new-independent-evidence'
  };
}

function evaluateReactivation(input={}){
  const {candidate={},beforeShape={},afterMetrics={}}=input;
  const harmful=
    Number(afterMetrics.missedRisk||0)>0 ||
    Number(afterMetrics.regressionBreakage||0)>0 ||
    Number(afterMetrics.falseBlock||0)>0;

  if(harmful){
    return {
      axisId:candidate.axisId||null,
      state:'SHAPE_RESTORE_CANDIDATE',
      targetShapeId:beforeShape.shapeId||null,
      autoRollback:false,
      requiresGate:true,
      reason:'reactivation-harmed-shape'
    };
  }

  return {
    axisId:candidate.axisId||null,
    state:'DOUBLE_CHECK_PASS',
    autoRollback:false,
    requiresGate:true,
    reason:'reactivation-not-yet-formal'
  };
}

function createRestoreCandidate(stableShape={},failureEvidence={}){
  return {
    state:'SHAPE_RESTORE_CANDIDATE',
    targetShapeId:stableShape.shapeId||null,
    targetShape:stableShape,
    requiresGate:true,
    autoRollback:false,
    preservedEvidence:unique([failureEvidence.evidenceId]),
    failureClassification:failureEvidence.classification||null
  };
}

function evaluateReverseEvolution(input={}){
  const before=input.before||{};
  const after=input.after||{};

  const noDetectionLoss=
    Number(after.additionalDetection||0) >= Number(before.additionalDetection||0);
  const noMissedRiskIncrease=
    Number(after.missedRisk||0) <= Number(before.missedRisk||0);
  const falseBlockImproved=
    Number(after.falseBlock||0) < Number(before.falseBlock||0);
  const costImproved=
    Number(after.validationCostMs||0) < Number(before.validationCostMs||0);

  if(noDetectionLoss && noMissedRiskIncrease && (falseBlockImproved || costImproved)){
    return {
      state:'REVERSE_EVOLUTION_CANDIDATE',
      promoted:false,
      requiresDoubleCheck:true,
      reason:'simpler-shape-preserves-detection-and-improves-cost-or-false-block'
    };
  }

  return {
    state:'OBSERVE',
    promoted:false,
    requiresDoubleCheck:false,
    reason:'reverse-evolution-benefit-not-proven'
  };
}

module.exports={
  transitionToDormant,
  proposeReactivation,
  evaluateReactivation,
  createRestoreCandidate,
  evaluateReverseEvolution
};
