'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-B',
  status:'BLIND_RUN_EVIDENCE_FROZEN',
  protocolCommit:'bd8fd9ea6000e0601ac78a77d0b46b08f9c19534',
  mutationCommit:'6adadb17ad7f86cccf5b60288e92d28f35fe5008',
  blindRun:{
    command:'node --test tools/*.test.cjs',
    tests:165,
    pass:164,
    fail:1,
    durationMs:481.0038,
    detectedOmission:true,
    silentPass:false,
    crash:false,
    unexpectedNewAxisCandidate:false
  },
  detection:{
    test:'優先度4のimpact.test-selectionは過去の有効軸を機械可読で継承する',
    assertion:"axis.inheritedFrom.includes('auth.context-isolation')",
    result:'FAIL_AS_EXPECTED_FOR_MUTATION'
  },
  interpretation:{
    deeperKnownInvariantDetectedOmission:true,
    g71DirectParentsStillPresent:true,
    autonomousUnknownAxisDiscoveryProven:false,
    newAxisGenerated:false,
    missedRisk:false,
    falseBlock:false,
    formalPromotionAllowed:false,
    note:'The system detected a one-level-deeper inheritance omission while G71 direct parents remained present. This strengthens self-monitoring evidence for known inheritance invariants, but does not establish autonomous discovery of an unknown inheritance rule.'
  },
  gate:'BLOCK_DEEP_MUTATION_DETECTED'
});
