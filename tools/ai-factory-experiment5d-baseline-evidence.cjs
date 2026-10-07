'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-D',
  phase:'BASELINE',
  status:'BASELINE_EVIDENCE_FROZEN',
  protocolCommit:'80a438da10454f9a31a4029729e64a2601b85952',
  baselineTestCommit:'cd30e582dcf7e2060cfaeaa8176c00268a1afa1e',
  input:{
    source:'redacted missed-risk Evidence derived from P7-E5-C',
    disclosedTargetAxis:false,
    disclosedParentAxis:false,
    disclosedCandidateName:false,
    detectorModifiedBeforeRun:false
  },
  measured:{
    tests:1,
    pass:1,
    fail:0,
    durationMs:116.0794,
    testBodyMs:17.2594,
    generatorCandidateCount:0,
    explorerCandidateCount:0
  },
  interpretation:{
    classification:'AUTONOMY_GAP_BASELINE',
    relevantCandidateGenerated:false,
    unrelatedCandidateGenerated:false,
    autonomousUnknownAxisDiscoveryProven:false,
    falseNewAxis:0,
    humanIntervention:true,
    formalPromotionAllowed:false,
    note:'Current unmodified candidate-generation paths did not convert redacted missed-risk Evidence into a new validation-axis candidate. Zero output is preserved as baseline Evidence.'
  },
  gate:'BLOCK_AUTONOMY_GAP'
});
