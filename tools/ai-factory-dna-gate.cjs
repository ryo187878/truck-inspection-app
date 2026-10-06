'use strict';

const STATES=Object.freeze({
  FORMAL:'formal',
  LIMITED:'limited',
  OBSERVE:'observe',
  DORMANT:'dormant',
  BLOCK:'block'
});

function classifyDnaCandidate(input={}){
  const {
    evidenceEvents=0,
    score=0,
    confirmed=false,
    antibodyPass=false,
    uniqueAdditionalDetection=false,
    falseBlockCount=0,
    missedRiskCount=0
  }=input;

  // Hard gates always beat score.
  if(!confirmed) return {state:STATES.BLOCK,reason:'evidence-not-confirmed'};
  if(!antibodyPass) return {state:STATES.BLOCK,reason:'antibody-failed'};
  if(missedRiskCount>0) return {state:STATES.BLOCK,reason:'missed-risk'};

  // Formal inheritance requires repeat Evidence and unique added value.
  if(evidenceEvents>=2 && score>=80 && uniqueAdditionalDetection && falseBlockCount===0){
    return {state:STATES.FORMAL,reason:'repeat-evidence-unique-value'};
  }

  // Useful, but authority stays limited until stronger Evidence exists.
  if(score>=60 && falseBlockCount===0 && (uniqueAdditionalDetection || evidenceEvents>=2)){
    return {state:STATES.LIMITED,reason:'useful-but-not-formal'};
  }

  if(score>=40) return {state:STATES.OBSERVE,reason:'insufficient-effective-evidence'};
  return {state:STATES.DORMANT,reason:'low-current-effectiveness'};
}

function inheritanceDecision(candidate,assessment){
  const result=classifyDnaCandidate(assessment);
  return {
    axisId:candidate?.axisId||null,
    ...result,
    inheritCapability:result.state===STATES.FORMAL,
    retainFailureEvidence:true
  };
}

module.exports={STATES,classifyDnaCandidate,inheritanceDecision};
