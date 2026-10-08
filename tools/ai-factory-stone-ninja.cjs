'use strict';
const crypto=require('node:crypto');
// Independent audit implementation: reconstructs evidence relationships without
// importing the proposer algorithm. An algorithmically separate review is not
// proof that the underlying sources were collected independently.
function safe(s){return typeof s==='string'&&s.trim().length>0;}
function equalArrays(a,b){return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((x,i)=>x===b[i]);}
function findJoin(a,b){
  // Independent reference algorithm: iterate candidate splice positions from low to high.
  const left=a.observedPath,right=b.observedPath;
  const possibilities=[];
  for(let n=2;n<Math.min(left.length,right.length);n++){
    let matches=true;
    for(let k=0;k<n;k++)if(left[left.length-n+k]!==right[k]){matches=false;break;}
    if(!matches)continue;
    const proposed=left.concat(right.slice(n));
    if(new Set(proposed).size===proposed.length&&proposed.length>left.length&&proposed.length>right.length){
      possibilities.push({path:proposed,overlap:right.slice(0,n)});
    }
  }
  return possibilities.reverse()[0]||null;
}
function hasAdjacentWitness(candidatePath,contenderPath){
  if(!Array.isArray(candidatePath)||!Array.isArray(contenderPath)||contenderPath.length<3)return false;
  // Negative evidence must reproduce a continuous structural portion, not a shared keyword.
  for(let i=0;i<=contenderPath.length-3;i++){
    for(let j=0;j<=candidatePath.length-3;j++){
      if(contenderPath[i]===candidatePath[j] && contenderPath[i+1]===candidatePath[j+1] &&
        contenderPath[i+2]===candidatePath[j+2])return true;
    }
  }
  return false;
}
function auditStone(stone={},evidence=[]){
  const rejectReasons=[];
  if(!stone||stone.kind!=='EVOLUTION_STONE_CANDIDATE'||!Array.isArray(stone.fragmentIds)||stone.fragmentIds.length!==2 ||
      stone.autoApply!==false ||stone.autoPromote!==false||stone.formalPromotion!==false||stone.causalProof!==false ||
      stone.requiresGate!==true ||stone.requiresNinja!==true ||stone.requiresIndependentReview!==true ||stone.status!=='CANDIDATE_ONLY'){rejectReasons.push('candidate-boundary-violated');}
  if(!Array.isArray(evidence))rejectReasons.push('invalid-source-ledger');
  const items=Array.isArray(evidence)?evidence:[];
  const refs=Array.isArray(stone?.fragmentIds)?stone.fragmentIds.map(id=>items.filter(e=>e?.evidenceId===id)):[];
  if(refs.length!==2||refs.some(found=>found.length!==1)){rejectReasons.push('missing-or-duplicate-source-fragment');}
  if(refs.length===2&&refs.every(v=>v.length===1)){
    const [a,b]=refs.map(v=>v[0]);
    const valid=[a,b].every(e=>e.verified===true &&e.independent===true&&e.outcome==='supports'&&
      [e.evidenceId,e.signalId,e.projectId,e.sourceId,e.signature].every(safe)&&
      Array.isArray(e.observedPath)&&e.observedPath.length>=3&&e.observedPath.every(safe)&&new Set(e.observedPath).size===e.observedPath.length);
    if(!valid)rejectReasons.push('unsupported-source-evidence');
    if(a.sourceId===b.sourceId||a.projectId===b.projectId||a.signalId===b.signalId||a.signature!==b.signature){
      rejectReasons.push('non-independent-or-mismatched-context');
    }
    const calculated=valid?findJoin(a,b):null;
    const expectedStoneId=calculated?'stone-'+crypto.createHash('sha256').update(JSON.stringify([a.signature,calculated.path])).digest('hex').slice(0,16):null;
    if(!calculated || stone.stoneId!==expectedStoneId || !equalArrays(calculated.path,stone.mergedPath)||!equalArrays(calculated.overlap,stone.sharedWindow)||
      stone.signature!==a.signature || !equalArrays([a.sourceId,b.sourceId],stone.sourceIds)||
      !equalArrays([a.projectId,b.projectId],stone.projectIds)||!equalArrays([a.signalId,b.signalId],stone.signalIds)){
      rejectReasons.push('invalid-or-tampered-structural-join');
    }
    const contradiction=items.filter(e=>e && ![a.evidenceId,b.evidenceId].includes(e.evidenceId)&&e.verified===true&&
      e.independent===true&&e.signature===stone.signature&& ['contradicts','control-refutes'].includes(e.outcome)&&
      safe(e.sourceId)&&e.sourceId!==a.sourceId&&e.sourceId!==b.sourceId&&
      hasAdjacentWitness(stone.mergedPath,e.observedPath));
    if(contradiction.length)rejectReasons.push('counterexample-to-joined-path');
  }
  const failed=rejectReasons.length>0;
  return {state:failed?'FALSE_STONE':'VALIDATED_LIMITED',stoneId:stone?.stoneId||null,
    structuralReviewPass:!failed,rejectReasons:[...new Set(rejectReasons)].sort(),
    causalProof:false,formalPromotion:false,autoApply:false,autoPromote:false,
    independentAgentProof:false,requiresGate:true,requiresIndependentReview:true,
    limitation:'Data-only structural check; real causal replication and independent source attestation are not established.'};
}
module.exports={auditStone};
