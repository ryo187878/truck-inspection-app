'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5',
  status:'BLIND_RUN_EVIDENCE_FROZEN',
  mutationCommit:'0a5ee36f53215925406670b8efcd057ce76f887a',
  protocolRecordCommit:'5863dc47ad3a3f6ec5a97e51680ccebc3100caf4',
  blindRun:{
    command:'node --test tools/*.test.cjs',
    tests:165,
    pass:163,
    fail:2,
    durationMs:500.6946,
    detectedOmission:true,
    silentPass:false,
    crash:false,
    unexpectedNewAxisCandidate:false,
    humanInterventionBeforeDetection:false
  },
  detections:[
    {
      test:'axis.effectiveness-scoringは優先度4以前の有効軸を継承している',
      assertion:"axis.inheritedFrom.includes('change.diff-purity')",
      result:'FAIL_AS_EXPECTED_FOR_MUTATION'
    },
    {
      test:'優先度4のimpact.test-selectionは過去の有効軸を機械可読で継承する',
      assertion:"axis.inheritedFrom.includes('change.diff-purity')",
      result:'FAIL_AS_EXPECTED_FOR_MUTATION'
    }
  ],
  interpretation:{
    existingInvariantDetectedOmission:true,
    autonomousUnknownAxisDiscoveryProven:false,
    newAxisGenerated:false,
    missedRisk:false,
    falseBlock:false,
    formalPromotionAllowed:false,
    note:'Existing inheritance invariants detected the deliberately omitted capability. This is self-monitoring evidence for known required inheritance, not evidence of autonomous unknown-axis discovery.'
  },
  gate:'BLOCK_MUTATION_DETECTED'
});
