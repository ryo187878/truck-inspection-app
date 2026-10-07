'use strict';

// Minimal, inspectable ETD. Detects an unnamed WHAT candidate from validation
// reachability loss; does not infer root cause, suggest fixes or approve changes.
const crypto=require('node:crypto');
const {inspectEvidence}=require('./ai-factory-evidence-sufficiency.cjs');

function edgeKey(e){return JSON.stringify([e.from,e.to]);}
function validateGraph(graph){
  if(!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.checks)) return false;
  const nodes=new Set(graph.nodes);
  if(nodes.size!==graph.nodes.length || nodes.size===0 || [...nodes].some(n=>typeof n!=='string'||!n.trim()))return false;
  if(new Set(graph.checks).size!==graph.checks.length || graph.checks.length===0 || graph.checks.some(c=>!nodes.has(c)))return false;
  const keys=new Set();
  for(const edge of graph.edges){
    if(!edge || !nodes.has(edge.from)||!nodes.has(edge.to)||edge.from===edge.to)return false;
    const k=edgeKey(edge);if(keys.has(k))return false;keys.add(k);
  }
  const neighbor=new Map([...nodes].map(n=>[n,[]]));
  for(const edge of graph.edges)neighbor.get(edge.from).push(edge.to);
  const visiting=new Set(),visited=new Set();
  function visit(n){if(visiting.has(n))return false;if(visited.has(n))return true;visiting.add(n);
    for(const child of neighbor.get(n))if(!visit(child))return false;
    visiting.delete(n);visited.add(n);return true;}
  return [...nodes].every(visit);
}
function sameMembers(a,b){return a.length===b.length && a.every(x=>b.includes(x));}
function reachableChecks(graph,origin){
  const near=new Map(graph.nodes.map(node=>[node,[]]));
  for(const edge of graph.edges)near.get(edge.from).push(edge.to);
  const seen=new Set(),todo=[origin];
  while(todo.length){const n=todo.pop();if(seen.has(n))continue;seen.add(n);todo.push(...near.get(n));}
  return graph.checks.filter(n=>seen.has(n));
}
function allCommon(state,signal,decision){
  return {state,signalId:signal?.signalId||null,classification:signal?.classification||null,
    candidates:[],requiresGate:true,requiresIndependentReview:true,
    formalPromotion:false,autoPromote:false,autoChange:false,
    releaseBlocked:decision?.releaseBlocked===true || signal?.classification==='MISSED_RISK'||signal?.classification==='SECURITY_CRITICAL'};
}
function freezeOrRequest(signal,decision,remainingBudget,request,reason){
  const state=remainingBudget>0?'REQUEST_MORE':'EVIDENCE_FREEZE';
  const result=allCommon(state,signal,decision);
  result.requests=[request];result.reason=reason;
  if(state==='EVIDENCE_FREEZE') result.freezeRecord={recordKind:'problem',signalId:signal.signalId,missing:[request],reason,autoResume:false};
  return result;
}
function discoverTargets(input={}){
  const {signal={},evidence=[],shape,trace={},remainingBudget=0}=input;
  const decision=inspectEvidence(signal,evidence,{remainingBudget});
  if(decision.state!=='ETD_ELIGIBLE'){
    const r=allCommon(decision.state,signal,decision);
    r.requests=decision.requests||[];
    if(decision.freezeRecord)r.freezeRecord=decision.freezeRecord;
    return r;
  }
  if(!shape || !shape.baseline || !shape.current){
    return freezeOrRequest(signal,decision,remainingBudget,'obtain-before-after-validation-shape','missing-comparable-shape-snapshots');
  }
  const {baseline,current}=shape;
  if(!validateGraph(baseline)||!validateGraph(current)||
      !sameMembers(baseline.nodes,current.nodes)||!sameMembers(baseline.checks,current.checks)){
    const r=allCommon('BLOCK_INVALID_SHAPE',signal,decision);r.reason='invalid-or-incomparable-validation-graphs';return r;
  }
  if(!baseline.nodes.includes(trace.origin) || trace.suitePass!==true || trace.independentRiskConfirmed!==true){
    return freezeOrRequest(signal,decision,remainingBudget,'obtain-changed-entity-and-independent-risk-confirmation','missing-or-unverified-missed-risk-trace');
  }
  const before=reachableChecks(baseline,trace.origin);
  const after=reachableChecks(current,trace.origin);
  const lost=before.filter(check=>!after.includes(check));
  if(!lost.length){
    return freezeOrRequest(signal,decision,remainingBudget,'investigate-unexplained-missed-risk-with-new-traces','no-demonstrable-coverage-loss-for-change-origin');
  }
  const currentEdges=new Set(current.edges.map(edgeKey));
  const removed=baseline.edges.filter(e=>!currentEdges.has(edgeKey(e)));
  const viable=[];
  for(const edge of removed){
    const restored={...current,edges:[...current.edges,edge]};
    if(!validateGraph(restored))continue;
    const restoredChecks=reachableChecks(restored,trace.origin);
    const rescued=lost.filter(check=>restoredChecks.includes(check));
    if(rescued.length)viable.push({edge,rescued});
  }
  if(viable.length===0){
    return freezeOrRequest(signal,decision,remainingBudget,'obtain-isolating-counterfactuals-for-lost-coverage','loss-cannot-be-attributed-to-a-single-relationship');
  }
  if(viable.length>1){
    const r=allCommon('TARGET_AMBIGUOUS',signal,decision);
    r.possibleRelationships=viable.map(x=>({...x.edge}));
    r.requests=['run-independent-isolation-controls-for-ambiguous-relationships'];
    r.reason='multiple-plausible-relationships';
    return r;
  }
  const found=viable[0],relationship={from:found.edge.from,to:found.edge.to};
  const id='etd-path-'+crypto.createHash('sha256').update([signal.signalId,edgeKey(relationship)].join('|')).digest('hex').slice(0,14);
  const r=allCommon('TARGET_CANDIDATE',signal,decision);
  r.candidates=[{
    candidateId:id,status:'CANDIDATE_ONLY',kind:'validation-reachability-loss',
    hypothesis:'A changed validation relationship may explain the lost check reachability; causal link to missed risk is not yet proved.',
    relationship,
    origin:trace.origin,
    affectedChecks:found.rescued,
    provenance:[...decision.verifiedSupportIds.map(id=>({kind:'evidence',id})),
      {kind:'shape-contrast',beforeReachableChecks:before,afterReachableChecks:after}],
    falsificationTests:[
      'In a disposable replica, restore only this relationship and check whether the named guard becomes reachable.',
      'Repeat the original blinded failure and healthy controls under an independent harness; reject if the risk remains missed.',
      'Check alternate-path and unrelated-change controls to challenge false attribution.'
    ],
    gate:'INDEPENDENT_TARGET_REVIEW_REQUIRED',
    formalPromotion:false,requiresIndependentReview:true
  }];
  r.reason='one-counterfactually-relevant-shape-relationship';
  return r;
}

module.exports={discoverTargets,validateGraph,reachableChecks};
