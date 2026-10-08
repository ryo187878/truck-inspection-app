'use strict';

// E5-I: non-executing, bounded search for HOW candidates from a previously
// ETD-discovered WHAT. Candidate only; this module has NO write/approval path.
// Reachability counterfactuals are NOT proof that an actual missed risk is fixed.
const crypto=require('node:crypto');
const {discoverTargets,reachableChecks,validateGraph}=require('./ai-factory-etd-target.cjs');

function key(edge){return JSON.stringify([edge.from,edge.to]);}
function differentEdges(a,b){
  const left=new Set(a.edges.map(key)),right=new Set(b.edges.map(key));
  return [...left].filter(x=>!right.has(x)).length + [...right].filter(x=>!left.has(x)).length;
}
function equivalentNodesAndChecks(a,b){
  return Array.isArray(a?.nodes)&&Array.isArray(b?.nodes)&&Array.isArray(a?.checks)&&Array.isArray(b?.checks)&&
    a.nodes.length===b.nodes.length && a.nodes.every(n=>b.nodes.includes(n)) &&
    a.checks.length===b.checks.length && a.checks.every(c=>b.checks.includes(c));
}
function base(state,etd){
  return {state,signalId:etd.signalId,classification:etd.classification,
    operations:[],requiresGate:true,requiresIndependentReview:true,
    autoApply:false,autoPromote:false,formalPromotion:false,
    releaseBlocked:etd.releaseBlocked===true};
}
function requestOrFreeze(etd,budget,reason,requests){
  const r=base(budget>0?'REQUEST_MORE':'EVIDENCE_FREEZE',etd);
  r.reason=reason;r.requests=requests;
  if(r.state==='EVIDENCE_FREEZE') r.freezeRecord={
    recordKind:'problem',signalId:etd.signalId,classification:etd.classification,
    reason,requests:[...requests],autoResume:false,releaseBlocked:r.releaseBlocked,
    lastTargetCandidateId:etd.candidates?.[0]?.candidateId||null,
    evidenceIds:[...new Set((etd.candidates?.[0]?.provenance||[])
      .filter(item=>item.kind==='evidence').map(item=>item.id))]
 };
  return r;
}
function verifyReviews(reviews,candidateId){
  if(!Array.isArray(reviews)||reviews.length<2)return {pass:false,reason:'insufficient-independent-reviews'};
  if(reviews.some(r=>r?.candidateId===candidateId && r?.verdict==='FAIL'))return {pass:false,rejected:true,reason:'independent-target-rejection'};
  const accepted=reviews.filter(r=>r && r.candidateId===candidateId && r.verdict==='PASS' &&
    r.verified===true && r.independent===true && r.isolationPass===true &&
    r.falsificationPass===true && r.controlPass===true &&
    typeof r.reviewerId==='string' && r.reviewerId.trim() &&
    !['ETD','EOD','SELF','GENERATOR'].includes(r.reviewerId.trim().toUpperCase()) &&
    typeof r.reviewSourceId==='string' && r.reviewSourceId.trim());
  if(accepted.length<2) return {pass:false,reason:'review-evidence-or-controls-missing'};
  if(new Set(accepted.map(r=>r.reviewerId)).size<2 || new Set(accepted.map(r=>r.reviewSourceId)).size<2)
    return {pass:false,reason:'review-provenance-not-independent'};
  return {pass:true,reviewerIds:accepted.map(r=>r.reviewerId)};
}
function counterfactualCandidate(graph,patched,origin,target){
  if(!validateGraph(patched)||!equivalentNodesAndChecks(graph,patched))return null;
  const before=reachableChecks(graph,origin),after=reachableChecks(patched,origin);
  const recovered=target.affectedChecks.filter(c=>!before.includes(c)&&after.includes(c));
  const lostHealthy=before.filter(c=>!after.includes(c));
  if(recovered.length!==target.affectedChecks.length || lostHealthy.length)return null;
  return {recoveredChecks:recovered,healthyChecksPreserved:before,
    totalChangedEdges:differentEdges(graph,patched),
    reachabilitySimulationOnly:true,actualRiskFixedNotEstablished:true};
}
function proposal(opType,target,review,counterfactual,recipe,meta={}){
  const payload=JSON.stringify([target.candidateId,opType,recipe,meta.targetShapeId||meta.axisId||null]);
  return {
    operationId:'eod-'+crypto.createHash('sha256').update(payload).digest('hex').slice(0,14),
    operationType:opType,targetCandidateId:target.candidateId,status:'CANDIDATE_ONLY',
    recipe,provenance:[...target.provenance,{kind:'target-review',reviewerIds:review.reviewerIds}],
    counterfactual,
    sourceEvidenceIds:meta.sourceEvidenceIds||[],
    falsificationTests:[
      'Under a disposable replica, independently perform only the proposed operation and reproduce the original missed-risk case.',
      'Confirm the real guard executes and independently prevents the seeded risk, not merely that a graph path exists.',
      'Run healthy, alternate-path and unrelated-change controls to disprove misleading improvement.',
      'Measure additional detection, missed risk, false block, change cost and Shape regression against the frozen baseline.'
    ],
    ...meta,
    requiresGate:true,requiresIndependentReview:true,formalPromotion:false,
    autoApply:false,autoRollback:false,autoPromote:false,releaseBlocked:meta.releaseBlocked??true
  };
}
function discoverOperations(input={}){
  const {signal={},evidence=[],shape={},trace={},remainingBudget=0,
    targetReviews=[],dormantCapabilities=[],reactivationEvidence=[],stableShape=null,policy={}}=input;
  const etd=discoverTargets({signal,evidence,shape,trace,remainingBudget});
  if(etd.state!=='TARGET_CANDIDATE'||etd.candidates.length!==1){
    const r=base(etd.state,etd);
    r.reason='upstream-etd-not-uniquely-approved';r.requests=etd.requests||[];
    if(etd.freezeRecord)r.freezeRecord=etd.freezeRecord;
    return r;
  }
  const target=etd.candidates[0];
  const reviews=verifyReviews(targetReviews,target.candidateId);
  if(!reviews.pass){
    const r=base(reviews.rejected?'BLOCK_TARGET_REJECTED':'BLOCK_TARGET_REVIEW_PENDING',etd);
    r.reason=reviews.reason;
    return r;
  }
  const current=shape.current;
  const link=target.relationship;
  const targetLinkKey=key(link);
  const currentEdges=new Set(current.edges.map(key));
  if(currentEdges.has(targetLinkKey))return requestOrFreeze(etd,remainingBudget,'target-link-already-present',['request-independent-isolating-causality-trace']);
  const patched={...current,edges:[...current.edges,{from:link.from,to:link.to}]};
  const cAdd=counterfactualCandidate(current,patched,target.origin,target);
  const proposed=[];
  const dormant=dormantCapabilities.filter(rec=>rec && rec.state==='DORMANT' && rec.axisId && rec.relationship && key(rec.relationship)===targetLinkKey);
  if(dormant.length>1)return requestOrFreeze(etd,remainingBudget,'multiple-matching-dormant-axes',['resolve-dormant-axis-lineage']);
  const stored=dormant[0];
  if(stored){
    const prevIds=new Set(stored.evidenceIds||[]);
    const fresh=reactivationEvidence.filter(ev=>ev && ev.axisId===stored.axisId && ev.verified===true &&
      ev.independent===true && ev.outcome==='detected' && ev.evidenceId && ev.sourceId &&
      !prevIds.has(ev.evidenceId) && !(stored.sourceIds||[]).includes(ev.sourceId));
    if(fresh.length && cAdd){
      proposed.push(proposal('REACTIVATE',target,reviews,cAdd,[{kind:'experimental-reactivation',axisId:stored.axisId},{kind:'edge-added',...link}],{
        axisId:stored.axisId,sourceEvidenceIds:[...new Set(fresh.map(ev=>ev.evidenceId))],
        experimentalInheritanceOnly:true,dormantEvidenceRetained:true
      }));
    }
  }else if(policy.directGraphMutationAllowed!==false && cAdd){
    proposed.push(proposal('ADD',target,reviews,cAdd,[{kind:'edge-added',...link}],{
      sourceEvidenceIds:target.provenance.filter(p=>p.kind==='evidence').map(p=>p.id)
    }));
  }
  if(stableShape && policy.stableShapeRestoreAllowed!==false && stableShape.gateApproved===true &&
    typeof stableShape.shapeId==='string' && stableShape.shapeId.trim() && stableShape.graph &&
    validateGraph(stableShape.graph) && equivalentNodesAndChecks(current,stableShape.graph)){
    const cRestored=counterfactualCandidate(current,stableShape.graph,target.origin,target);
    // A broad restore would silently revert unrelated progress. Restrict first EOD unit
    // to the same minimal missing relationship; broader Shape restoration requires new tests.
    const restoredDifference=differentEdges(current,stableShape.graph);
    const expectedRestoration=stableShape.graph.edges.some(e=>key(e)===targetLinkKey);
    if(cRestored && restoredDifference===1 && expectedRestoration){
      proposed.push(proposal('RESTORE',target,reviews,cRestored,[{kind:'restore-gate-approved-shape',shapeId:stableShape.shapeId}],{
        targetShapeId:stableShape.shapeId,autoRollback:false,sourceEvidenceIds:[]
      }));
    }
  }
  if(proposed.length===0){
    const why=stored?'dormant-reactivation-evidence-inadequate':'no-safe-operation-supported-by-current-evidence';
    const req=stored?'obtain-new-independent-evidence-for-dormant-reactivation':'obtain-independent-operation-counterfactual-or-approved-stable-shape';
    return requestOrFreeze(etd,remainingBudget,why,[req]);
  }
  if(proposed.length>1){
    const r=base('OPERATION_AMBIGUOUS',etd);
    r.reason='multiple-admissible-operation-types-require-independent-disambiguation';
    r.possibleOperations=proposed;
    r.requests=['measure-counterfactual-effectiveness-and-side-effects-of-competing-operations'];
    return r;
  }
  const r=base('OPERATION_CANDIDATE',etd);
  r.operations=proposed;r.reason='single-bounded-counterfactual-operation';
  r.targetCandidateId=target.candidateId;
  return r;
}
module.exports={discoverOperations,verifyReviews,counterfactualCandidate};
