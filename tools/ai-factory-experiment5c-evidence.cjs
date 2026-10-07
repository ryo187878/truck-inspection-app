'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-C',
  status:'BLIND_RUN_EVIDENCE_FROZEN',
  protocolCommit:'0b49dd3e502a2d2e7c27d2221ba2faf176f692a8',
  mutationCommit:'566da48e6062c0257f88c6d82a5de41d410cf7d6',
  blindRun:{
    command:'node --test tools/*.test.cjs',
    tests:165,
    pass:165,
    fail:0,
    durationMs:476.4688,
    silentPass:true,
    crash:false,
    unexpectedNewAxisCandidate:false
  },
  omission:{
    childAxis:'promotion.shared-dna',
    omittedParent:'change.diff-purity',
    directAssertionFound:false
  },
  interpretation:{
    classification:'MISSED_RISK',
    existingProtectionDetectedOmission:false,
    selectorParallelGuardPresent:true,
    autonomousUnknownAxisDiscoveryProven:false,
    newAxisGenerated:false,
    falseBlock:false,
    formalPromotionAllowed:false,
    note:'The deliberately omitted inheritance edge was not detected by the existing suite. All 165 tests passed. This is frozen as missed-risk Evidence and must not be rewritten by later fixes.'
  },
  gate:'BLOCK_MISSED_RISK'
});
