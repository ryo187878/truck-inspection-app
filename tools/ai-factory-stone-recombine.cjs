'use strict';
// E5-J. Evidence is a resource, never an instruction or permission to modify code.
// This is a bounded structural hypothesis generator, not a causal inference engine.
const crypto=require('node:crypto');
const RELEASE_BLOCKERS=new Set(['MISSED_RISK','SECURITY_CRITICAL']);
function nonEmpty(s){return typeof s==='string'&&s.trim().length>0;}
function validFragment(e){return e&&[e.evidenceId,e.signalId,e.projectId,e.sourceId,e.signature].every(nonEmpty)&&
  e.outcome==='supports'&&e.verified===true&&e.independent===true&&Array.isArray(e.observedPath)&&
  e.observedPath.length>=3&&e.observedPath.length<=64&&e.observedPath.every(nonEmpty)&&
  new Set(e.observedPath).size===e.observedPath.length;}
function mergedChain(a,b){
  const A=a.observedPath,B=b.observedPath;
  for(let n=Math.min(A.length,B.length)-1;n>=2;n--){
    if(A.slice(-n).every((x,i)=>x===B[i])){
      const path=[...A,...B.slice(n)];
      if(path.length>Math.max(A.length,B.length)&&new Set(path).size===path.length)return {path,overlap:A.slice(-n)};
    }
  }
  return null;
}
function stateBase(state,signal,extra={}){return {state,candidates:[],releaseBlocked:RELEASE_BLOCKERS.has(signal?.classification),
  requiresGate:true,formalPromotion:false,autoApply:false,...extra};}
function discoverEvolutionStones(input={}){
  const {evidence=[],signal={},remainingBudget=0,maxPairs=300}=input;
  if(!Array.isArray(evidence)|| !Number.isInteger(maxPairs)||maxPairs<1||maxPairs>10000){
    return stateBase('BLOCK_INVALID_INPUT',signal,{reason:'invalid-evidence-or-pair-budget',pairsConsidered:0,truncated:false});
  }
  const ids=evidence.map(e=>e?.evidenceId).filter(nonEmpty);
  if(ids.length!==new Set(ids).size){
    return stateBase('BLOCK_INVALID_INPUT',signal,{reason:'duplicate-evidence-id',pairsConsidered:0,truncated:false});
  }
  const good=evidence.filter(validFragment).sort((a,b)=>a.evidenceId.localeCompare(b.evidenceId,'en'));
  const totalPairs=good.length*(good.length-1)/2;
  let checked=0;
  const map=new Map();
  for(let i=0;i<good.length;i++){
    for(let j=i+1;j<good.length;j++){
      if(checked>=maxPairs)break;
      checked++;
      const x=good[i],y=good[j];
      if(x.projectId===y.projectId||x.sourceId===y.sourceId||x.signalId===y.signalId||x.signature!==y.signature)continue;
      for(const [first,second] of [[x,y],[y,x]]){
        const merged=mergedChain(first,second);
        if(!merged)continue;
        const id='stone-'+crypto.createHash('sha256').update(JSON.stringify([first.signature,merged.path])).digest('hex').slice(0,16);
        if(map.has(id)){
          map.get(id).additionalWitnesses.push([first.evidenceId,second.evidenceId]);continue;
        }
        map.set(id,{
          stoneId:id,kind:'EVOLUTION_STONE_CANDIDATE',status:'CANDIDATE_ONLY',signature:first.signature,
          fragmentIds:[first.evidenceId,second.evidenceId],sourceIds:[first.sourceId,second.sourceId],
          projectIds:[first.projectId,second.projectId],signalIds:[first.signalId,second.signalId],
          sharedWindow:merged.overlap,mergedPath:merged.path,additionalWitnesses:[],
          hypothesis:'Cross-problem verified path fragments may form a previously unobserved structural chain. Not proof of a defect or causality.',
          proposedFalsification:[
            'Run independent, source-separated controls on the complete chain, not only each fragment.',
            'Search contradictory observations matching the structural window and signature.',
            'Reproduce any proposed risk against a healthy negative-control implementation.'
          ],
          requiresNinja:true,requiresGate:true,requiresIndependentReview:true,
          releaseBlocked:RELEASE_BLOCKERS.has(signal?.classification),
          causalProof:false,formalPromotion:false,autoApply:false,autoPromote:false
        });
      }
    }
    if(checked>=maxPairs)break;
  }
  const candidates=[...map.values()].sort((a,b)=>a.stoneId.localeCompare(b.stoneId,'en'));
  const truncated=totalPairs>checked;
  if(truncated)return stateBase('INSUFFICIENT_BUDGET',signal,{candidates,truncated,pairsConsidered:checked,totalPairs,
    reason:'pair-search-budget-exhausted; no clean-negative conclusion',requests:['extend-bounded-pair-exploration']});
  if(candidates.length)return stateBase('STONE_CANDIDATES',signal,{candidates,truncated:false,pairsConsidered:checked,totalPairs,
    reason:'unprompted-cross-project-structural-relationship-hypothesis'});
  const requests=['obtain-independent-cross-context-observations-with-reproducible-structural-overlap'];
  if(remainingBudget>0)return stateBase('REQUEST_MORE',signal,{pairsConsidered:checked,totalPairs,truncated:false,requests,
    reason:'no-cross-context-relation-proven'});
  const releaseBlocked=RELEASE_BLOCKERS.has(signal?.classification);
  return stateBase('EVIDENCE_FREEZE',signal,{pairsConsidered:checked,totalPairs,truncated:false,requests,
    freezeRecord:{recordKind:'problem',signalId:signal?.signalId||null,classification:signal?.classification||null,
      evidenceIds:ids,reason:'cross-context-evidence-insufficient',requests,releaseBlocked,autoResume:false},
    reason:'no-verified-independent-overlapping-observations'});
}
module.exports={discoverEvolutionStones};
