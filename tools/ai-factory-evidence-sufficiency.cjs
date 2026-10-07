'use strict';

// Minimal rule-based Evidence lifecycle scaffold. Not an ETD, EOD, or autonomous explorer.
const REQUIRED_ROLES=Object.freeze(['provenance','reproduction','control']);
const RELEASE_BLOCKING=new Set(['MISSED_RISK','SECURITY_CRITICAL']);

function listUnique(values){
  return [...new Set(values.filter(value=>typeof value==='string' && value.trim()))];
}

function inspectEvidence(signal={},evidence=[],options={}){
  if(typeof signal?.signalId!=='string' || !signal.signalId.trim() || typeof signal?.observation!=='string' || !signal.observation.trim()){
    return {state:'INVALID_SIGNAL',reason:'missing-observable-unresolved-signal',requiresGate:true,formalPromotion:false,releaseBlocked:true};
  }

  const related=evidence.filter(item=>item && item.signalId===signal.signalId && item.evidenceId);
  const verified=related.filter(item=>item.verified===true);
  const supporting=verified.filter(item=>item.outcome==='supports');
  const contradictions=verified.filter(item=>item.outcome==='contradicts');
  const missingRoles=REQUIRED_ROLES.filter(role=>!supporting.some(item=>item.role===role));
  const independentSources=listUnique(supporting.filter(item=>item.independent===true).map(item=>item.sourceId));
  const requests=[...missingRoles.map(role=>'obtain-'+role)];
  if(independentSources.length<2) requests.push('independent-corroboration');
  if(contradictions.length) requests.push('resolve-contradiction');
  const hasSufficiency=missingRoles.length===0 && independentSources.length>=2 && contradictions.length===0;
  const budget=Number.isFinite(options.remainingBudget)?Math.max(0,options.remainingBudget):0;
  const state=hasSufficiency?'ETD_ELIGIBLE':budget>0?'REQUEST_MORE':'EVIDENCE_FREEZE';
  const evidenceIds=listUnique(related.map(item=>item.evidenceId));
  const common={
    state,signalId:signal.signalId,classification:signal.classification||null,
    missingRoles,requests,verifiedSupportIds:listUnique(supporting.map(item=>item.evidenceId)),
    contradictoryIds:listUnique(contradictions.map(item=>item.evidenceId)),
    independentSourceCount:independentSources.length,requiresGate:true,formalPromotion:false,
    releaseBlocked:RELEASE_BLOCKING.has(signal.classification)
  };
  if(state==='EVIDENCE_FREEZE'){
    common.freezeRecord={
      state:'EVIDENCE_FREEZE',signalId:signal.signalId,
      classification:signal.classification||null,observation:signal.observation,
      evidenceIds,sourceIds:listUnique(related.map(item=>item.sourceId)),
      missingRoles:[...missingRoles],requests:[...requests],
      reason:contradictions.length?'verified-contradiction':'evidence-insufficient',
      releaseBlocked:common.releaseBlocked,
      // Separate a frozen task from a DORMANT validation capability.
      recordKind:'problem',autoResume:false
    };
  }
  return common;
}

function proposeProblemReactivation(frozenDecision={},oldEvidence=[],newEvidence=[]){
  if(frozenDecision.state!=='EVIDENCE_FREEZE'||!frozenDecision.freezeRecord){
    return {state:'BLOCKED',reason:'no-frozen-problem',autoResume:false,requiresGate:true};
  }
  const frozen=frozenDecision.freezeRecord;
  const oldIds=new Set(oldEvidence.map(item=>item?.evidenceId));
  const oldSources=new Set(oldEvidence.filter(item=>item?.signalId===frozen.signalId).map(item=>item.sourceId));
  const genuine=newEvidence.filter(item=>item && item.signalId===frozen.signalId && item.verified===true &&
    item.independent===true && item.outcome==='supports' && item.evidenceId &&
    !oldIds.has(item.evidenceId) && item.sourceId && !oldSources.has(item.sourceId));
  const combined=[...oldEvidence,...newEvidence];
  const renewed=inspectEvidence({
    signalId:frozen.signalId,classification:frozen.classification,observation:frozen.observation
  },combined,{remainingBudget:0});

  if(!genuine.length || renewed.state!=='ETD_ELIGIBLE'){
    return {
      state:'EVIDENCE_FREEZE',reason:!genuine.length?'no-new-independent-verified-evidence':'still-insufficient-or-conflicting',
      signalId:frozen.signalId,autoResume:false,formalPromotion:false,requiresGate:true,
      evidenceIds:listUnique(combined.filter(item=>item?.signalId===frozen.signalId).map(item=>item.evidenceId)),
      releaseBlocked:frozen.releaseBlocked
    };
  }
  return {
    state:'REACTIVATE_CANDIDATE',recordKind:'problem',signalId:frozen.signalId,
    newlyContributingIds:listUnique(genuine.map(item=>item.evidenceId)),
    evidenceIds:listUnique(combined.filter(item=>item?.signalId===frozen.signalId).map(item=>item.evidenceId)),
    autoResume:false,formalPromotion:false,requiresGate:true,requiresIndependentReview:true,
    releaseBlocked:frozen.releaseBlocked,
    nextReview:'independent-reproduction-and-ETD-Gate'
  };
}

module.exports={REQUIRED_ROLES,inspectEvidence,proposeProblemReactivation};
