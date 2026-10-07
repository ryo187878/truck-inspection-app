'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-B',
  parentExperiment:'P7-E5',
  name:'Stealth Semantic Inheritance Omission',
  status:'FROZEN_PRE_MUTATION',
  baseCommit:'6afead429f9909aeae51f824c5a5d28ae3381c29',
  branch:'ai-factory-priority7-stealth-axis-omission-experiment5b',
  rationale:'Escalate from directly asserted inheritance omission to a deeper semantic inheritance omission while keeping G71 direct parents present.',
  constraints:{
    keepG71DirectParents:true,
    doNotTellSystemMissingCapability:true,
    doNotAddDetectionTestBeforeBlindRun:true,
    doNotSwapTargetAfterResult:true,
    preserveAllOutcomesAsEvidence:true,
    autoPromotion:false
  },
  selectedMutation:{
    targetAxis:'impact.test-selection',
    keepDirectParentAtG71:'impact.test-selection',
    omittedParentCapability:'auth.context-isolation',
    mutationLevel:'one level below G71 direct-parent assertions'
  },
  expectedInterpretationRules:{
    existingTestStops:'known invariant self-monitoring evidence',
    silentPass:'missed-risk evidence',
    crash:'structural dependency evidence',
    unexpectedCandidate:'candidate autonomy evidence only; no promotion'
  },
  gate:'NOT_RUN'
});
