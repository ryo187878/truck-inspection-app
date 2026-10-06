#!/usr/bin/env node
'use strict';

const {AXIS_BY_ID}=require('./ai-factory-axis-registry.cjs');
const {EVIDENCE_LEDGER,validateLedger,eventsForAxis}=require('./ai-factory-evidence-ledger.cjs');

function clamp(value,min=0,max=100){
  return Math.max(min,Math.min(max,Number(value)||0));
}

function average(values,fallback=0){
  const nums=values.filter(Number.isFinite);
  return nums.length?nums.reduce((a,b)=>a+b,0)/nums.length:fallback;
}

function scoreAxis(axisId,events=EVIDENCE_LEDGER,{costBudgetMs=2000}={}){
  if(!AXIS_BY_ID.has(axisId)) throw new Error('Unknown axis: '+axisId);
  const ledgerCheck=validateLedger(events);
  if(!ledgerCheck.pass) throw new Error('Invalid evidence ledger: '+ledgerCheck.issues.join(', '));

  const axisEvents=eventsForAxis(axisId,events);
  if(axisEvents.length===0){
    return {
      axisId,
      score:0,
      eligible:false,
      eventCount:0,
      detectedIssueCount:0,
      falsePositiveCount:0,
      missedRiskCount:0,
      components:{
        evidenceStrength:0,reliability:0,confidence:0,
        defectSignal:0,riskClosure:0,costEfficiency:50
      }
    };
  }

  const positives=axisEvents.filter(e=>e.outcome==='detected'||e.outcome==='validated');
  const detectedIssueCount=axisEvents
    .filter(e=>e.outcome==='detected')
    .reduce((sum,e)=>sum+e.issueCount,0);
  const falsePositiveCount=axisEvents.filter(e=>e.outcome==='false-positive').length;
  const missedRiskCount=axisEvents.filter(e=>e.outcome==='missed-risk').length;

  const evidenceStrength=clamp(average(positives.map(e=>e.evidenceStrength),0));
  const reliability=clamp(100-(falsePositiveCount*20)-(missedRiskCount*45));
  const confidence=clamp(axisEvents.length*20);
  const defectSignal=clamp((detectedIssueCount*20)+(positives.length*8));
  const riskClosure=clamp(100-average(axisEvents.map(e=>e.residualRisk),50));

  const measuredCosts=axisEvents.map(e=>e.executionCostMs).filter(Number.isFinite);
  const costEfficiency=measuredCosts.length
    ? clamp(100-(average(measuredCosts,0)/Math.max(1,costBudgetMs))*100)
    : 50;

  const score=clamp(
    evidenceStrength*0.30 +
    reliability*0.20 +
    confidence*0.15 +
    defectSignal*0.15 +
    riskClosure*0.10 +
    costEfficiency*0.10
  );

  return {
    axisId,
    score:Number(score.toFixed(2)),
    eligible:axisEvents.length>=2 && missedRiskCount===0 && score>=60,
    eventCount:axisEvents.length,
    detectedIssueCount,
    falsePositiveCount,
    missedRiskCount,
    components:{
      evidenceStrength:Number(evidenceStrength.toFixed(2)),
      reliability:Number(reliability.toFixed(2)),
      confidence:Number(confidence.toFixed(2)),
      defectSignal:Number(defectSignal.toFixed(2)),
      riskClosure:Number(riskClosure.toFixed(2)),
      costEfficiency:Number(costEfficiency.toFixed(2))
    }
  };
}

function rankAxes(axisIds,events=EVIDENCE_LEDGER,options={}){
  const unique=[...new Set(axisIds)];
  for(const id of unique) if(!AXIS_BY_ID.has(id)) throw new Error('Unknown axis: '+id);
  return unique
    .map(id=>scoreAxis(id,events,options))
    .sort((a,b)=>b.score-a.score || a.axisId.localeCompare(b.axisId));
}

function selectEffectiveInheritedAxes(axisIds,events=EVIDENCE_LEDGER,{
  minScore=60,minEvidenceEvents=2,minCount=1,maxCount=3,costBudgetMs=2000
}={}){
  const ranked=rankAxes(axisIds,events,{costBudgetMs});
  const eligible=ranked.filter(row=>
    row.score>=minScore &&
    row.eventCount>=minEvidenceEvents &&
    row.missedRiskCount===0
  );
  if(eligible.length<minCount){
    // Safety rule: insufficient Evidence never means "drop the axis".
    return {
      selected:[...new Set(axisIds)].sort(),
      ranked,
      fallback:true,
      reason:'insufficient-evidence-retain-candidates'
    };
  }
  return {
    selected:eligible.slice(0,Math.max(minCount,maxCount)).map(row=>row.axisId),
    ranked,
    fallback:false,
    reason:'evidence-ranked'
  };
}

function formatRanking(result){
  const lines=['AI FACTORY AXIS EFFECTIVENESS'];
  for(const row of result.ranked){
    lines.push(
      '- '+row.axisId+
      ' score='+row.score.toFixed(2)+
      ' events='+row.eventCount+
      ' defects='+row.detectedIssueCount+
      ' fp='+row.falsePositiveCount+
      ' missed='+row.missedRiskCount
    );
  }
  lines.push('Selected: '+result.selected.join(', '));
  lines.push('Fallback: '+(result.fallback?'YES':'NO'));
  return lines.join('\n');
}

if(require.main===module){
  const candidates=process.argv.slice(2);
  const axisIds=candidates.length?candidates:[
    'change.diff-purity',
    'dispatch.branch-normalization',
    'promotion.shared-dna',
    'auth.context-isolation',
    'impact.test-selection'
  ];
  try{
    const result=selectEffectiveInheritedAxes(axisIds);
    console.log(formatRanking(result));
  }catch(error){
    console.error(error.message);
    process.exitCode=2;
  }
}

module.exports={clamp,average,scoreAxis,rankAxes,selectEffectiveInheritedAxes,formatRanking};
