'use strict';

// Frozen before antibody execution or implementation.
module.exports=Object.freeze({
  experiment:'P7-E5-G',
  name:'Evidence Sufficiency, EVIDENCE_FREEZE and Problem Reactivation',
  baselineReference:'P7-E5-D; redacted MISSED_RISK, 165/165 silent PASS, no candidates',
  baseCommit:'fc3d0aa56f72ddadeb56da112135eb53070836f8',
  sourceBranch:'ai-factory-priority7-dormant-reactivation-experiment5f',
  phase:'MINIMAL_SCAFFOLD_ANTIBODY_FIRST',
  hypothesis:'Evidence insufficiency can be distinguished from target-discovery failure; a problem can be frozen without losing provenance and later proposed for independent-gated reactivation when meaningful Evidence arrives.',
  roles:['provenance','reproduction','control'],
  evidenceRequirements:[
    'Signal is unresolved and has a stable signalId, without a supplied solution/axis name.',
    'Only verified supporting Evidence matching the signal counts toward required coverage.',
    'At least two independent source identifiers must corroborate the signal.',
    'Verified contradictory Evidence must not be silently outweighed by quantity.',
    'Duplicate or irrelevant evidence must not satisfy missing roles.',
    'If within search budget, emit precise REQUEST_MORE; when exhausted emit EVIDENCE_FREEZE.',
    'EVIDENCE_FREEZE preserves the unresolved problem and missing Evidence specification.',
    'New Evidence can emit REACTIVATE_CANDIDATE only when sufficiency is restored and an independent newly verified source contributed.',
    'REACTIVATE_CANDIDATE never automatically resumes or promotes; independent review and Gate required.',
    'EVIDENCE_FREEZE for MISSED_RISK does not unblock release.',
    'DORMANT is axis capability dormancy; EVIDENCE_FREEZE is separate problem/task state.'
  ],
  exclusions:[
    'No human-named target axis or detector implementation provided as input.',
    'No self-approval, main update or remote commit.',
    'This standalone rule-based scaffold does not prove generalized self-discovery, ETD or EOD.',
    'No full repository regression possible from this isolated staging directory.'
  ],
  evaluationCases:['E0 no evidence','E1 weak evidence','E2 sufficient multi-role corroboration','E3 conflicting Evidence','E4 irrelevant flood','E5 duplicate source','E6 frozen problem resumes after independent new Evidence','E7 false reactivation blocked','E8 severe missed risk remains release-blocking'],
  formalPromotionAllowed:false,
  gate:'NOT_RUN'
});
