'use strict';

const EXTERNAL_PROOFS=[
  {
    proofId:'EXT-INVENTORY-NONNEGATIVE-20261006',
    repository:'TheCandyLoop/inventory-management-crud',
    commitSha:'54a500b6e288dddc3fa4223f1dc9e75b96132d18',
    applicationModified:false,
    sourceRunId:37488245949,
    generatedAxisId:'boundary.server-domain-enforcement',
    candidateGeneration:71,
    registeredGeneration:81,
    noveltyScore:0.962,
    outcome:'detected',
    observation:{
      createStatus:201,
      persistedNegative:true,
      quantity:-7,
      price:-3.5
    }
  },
  {
    proofId:'EXT-BOOKING-CAPACITY-20261006',
    repository:'rizbud/express-sqlite-booking-system',
    commitSha:'02edad46d1d59a9d95b64722a88e00b1ffe5c408',
    applicationModified:false,
    sourceRunId:37488245949,
    generatedAxisId:'resource.consumption-sign-invariant',
    candidateGeneration:71,
    registeredGeneration:81,
    noveltyScore:1,
    outcome:'detected',
    observation:{
      beforeSeats:10,
      bookingStatus:201,
      submittedSeats:-3,
      afterSeats:13,
      increased:true
    }
  }
];

function validateExternalProofs(proofs=EXTERNAL_PROOFS){
  const issues=[];
  const seen=new Set();
  for(const proof of proofs){
    if(!proof.proofId) issues.push('missing-proofId');
    if(seen.has(proof.proofId)) issues.push('duplicate-proofId:'+proof.proofId);
    seen.add(proof.proofId);
    if(!/^[0-9a-f]{40}$/.test(proof.commitSha||'')) issues.push('invalid-commit:'+proof.proofId);
    if(proof.applicationModified!==false) issues.push('external-app-modified:'+proof.proofId);
    if(proof.outcome!=='detected') issues.push('not-detected:'+proof.proofId);
    if(proof.registeredGeneration<=proof.candidateGeneration) issues.push('not-next-generation:'+proof.proofId);
  }
  return {pass:issues.length===0,issues};
}

module.exports={EXTERNAL_PROOFS,validateExternalProofs};
