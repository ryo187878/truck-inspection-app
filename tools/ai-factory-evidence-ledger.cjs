'use strict';

const {AXIS_BY_ID}=require('./ai-factory-axis-registry.cjs');

const OUTCOMES=new Set(['detected','validated','false-positive','missed-risk']);

// Historical Evidence already produced by Vaccine 1-4.
// Numeric issueCount values below are recorded counts from each completed report.
// executionCostMs stays null when an axis-specific measured duration was not recorded.
const EVIDENCE_LEDGER=[
  {
    evidenceId:'V001-DIFF-STOP',
    axisId:'change.diff-purity',
    generation:21,
    outcome:'detected',
    issueCount:1,
    evidenceStrength:95,
    residualRisk:10,
    executionCostMs:null,
    source:'Vaccine1 contaminated unrelated diff blocked before main'
  },
  {
    evidenceId:'V001-DIFF-REGRESSION',
    axisId:'change.diff-purity',
    generation:30,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:92,
    residualRisk:10,
    executionCostMs:null,
    source:'Vaccine1 G30 diff purity regression lock'
  },
  {
    evidenceId:'V001-BRANCH-FIX',
    axisId:'dispatch.branch-normalization',
    generation:21,
    outcome:'detected',
    issueCount:1,
    evidenceStrength:95,
    residualRisk:10,
    executionCostMs:null,
    source:'Vaccine1 branch normalization defect case'
  },
  {
    evidenceId:'V001-BRANCH-SPIRAL',
    axisId:'dispatch.branch-normalization',
    generation:29,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:92,
    residualRisk:10,
    executionCostMs:null,
    source:'Vaccine1 shared core and branch normalization regression'
  },
  {
    evidenceId:'V002-SHARED-DNA-STOP',
    axisId:'promotion.shared-dna',
    generation:31,
    outcome:'detected',
    issueCount:2,
    evidenceStrength:97,
    residualRisk:8,
    executionCostMs:null,
    source:'Vaccine2 shared DNA / canonical source problems blocked'
  },
  {
    evidenceId:'V002-SHARED-DNA-SPIRAL',
    axisId:'promotion.shared-dna',
    generation:40,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:95,
    residualRisk:8,
    executionCostMs:null,
    source:'Vaccine2 Promotion Gate and G31-G40 regression'
  },
  {
    evidenceId:'V003-AUTH-BASELINE',
    axisId:'auth.context-isolation',
    generation:41,
    outcome:'detected',
    issueCount:5,
    evidenceStrength:98,
    residualRisk:8,
    executionCostMs:null,
    source:'Vaccine3 registration/login context baseline failures'
  },
  {
    evidenceId:'V003-AUTH-SPIRAL',
    axisId:'auth.context-isolation',
    generation:50,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:96,
    residualRisk:8,
    executionCostMs:null,
    source:'Vaccine3 G41-G50 and full regression'
  },
  {
    evidenceId:'V004-SELECTOR-DESIGN',
    axisId:'impact.test-selection',
    generation:51,
    outcome:'detected',
    issueCount:2,
    evidenceStrength:92,
    residualRisk:10,
    executionCostMs:null,
    source:'Vaccine4 duplicate execution and unknown-impact fallback design issues'
  },
  {
    evidenceId:'V004-SELECTOR-SPIRAL',
    axisId:'impact.test-selection',
    generation:60,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:95,
    residualRisk:8,
    executionCostMs:null,
    source:'Vaccine4 G51-G60 targeted selection plus 94/94 full regression'
  },
  {
    evidenceId:'V004-TENANT-CROSSCHECK',
    axisId:'tenant.isolation',
    generation:56,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:86,
    residualRisk:15,
    executionCostMs:null,
    source:'Vaccine4 tenant isolation targeted cross-axis validation'
  },
  {
    evidenceId:'V004-DISPATCH-LIFECYCLE',
    axisId:'dispatch.lifecycle',
    generation:60,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:84,
    residualRisk:15,
    executionCostMs:null,
    source:'Vaccine4 94/94 full regression retained dispatch lifecycle tests'
  },
  {
    evidenceId:'V004-UI-INTEGRITY',
    axisId:'ui.integrity',
    generation:60,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:82,
    residualRisk:18,
    executionCostMs:null,
    source:'Vaccine4 94/94 full regression retained UI integrity tests'
  },
  {
    evidenceId:'V004-YAMATO',
    axisId:'yamato.daily',
    generation:60,
    outcome:'validated',
    issueCount:0,
    evidenceStrength:82,
    residualRisk:18,
    executionCostMs:null,
    source:'Vaccine4 94/94 full regression retained Yamato daily tests'
  }
];

function validateEvidenceEvent(event){
  const issues=[];
  if(!event || typeof event!=='object') return ['event-not-object'];
  if(!event.evidenceId) issues.push('missing-evidenceId');
  if(!AXIS_BY_ID.has(event.axisId)) issues.push('unknown-axis:'+event.axisId);
  if(!Number.isInteger(event.generation)||event.generation<1) issues.push('invalid-generation');
  if(!OUTCOMES.has(event.outcome)) issues.push('invalid-outcome:'+event.outcome);
  if(!Number.isInteger(event.issueCount)||event.issueCount<0) issues.push('invalid-issueCount');
  if(!Number.isFinite(event.evidenceStrength)||event.evidenceStrength<0||event.evidenceStrength>100) issues.push('invalid-evidenceStrength');
  if(!Number.isFinite(event.residualRisk)||event.residualRisk<0||event.residualRisk>100) issues.push('invalid-residualRisk');
  if(event.executionCostMs!==null && (!Number.isFinite(event.executionCostMs)||event.executionCostMs<0)) issues.push('invalid-executionCostMs');
  if(!String(event.source||'').trim()) issues.push('missing-source');
  return issues;
}

function validateLedger(events=EVIDENCE_LEDGER){
  const issues=[];
  const ids=new Set();
  for(const event of events){
    const eventIssues=validateEvidenceEvent(event);
    for(const issue of eventIssues) issues.push((event?.evidenceId||'?')+':'+issue);
    if(event?.evidenceId){
      if(ids.has(event.evidenceId)) issues.push(event.evidenceId+':duplicate-evidenceId');
      ids.add(event.evidenceId);
    }
  }
  return {pass:issues.length===0,issues};
}

function eventsForAxis(axisId,events=EVIDENCE_LEDGER){
  if(!AXIS_BY_ID.has(axisId)) throw new Error('Unknown axis: '+axisId);
  return events.filter(event=>event.axisId===axisId);
}

module.exports={OUTCOMES,EVIDENCE_LEDGER,validateEvidenceEvent,validateLedger,eventsForAxis};
