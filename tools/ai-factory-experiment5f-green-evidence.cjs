'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-F',
  phase:'MINIMAL_LIFECYCLE_GREEN',
  status:'GREEN_EVIDENCE_FROZEN',
  protocolCommit:'a4b551b649b8c470a7a8257a94080f66813bd8c0',
  antibodyCommit:'5f5676341fbd47e9838f030ecffcebc4b2ada221',
  redEvidenceCommit:'6792c0e2e645411fa4671942bf602be5448499e1',
  implementationCommit:'274b1f8a66a9c3edd3bbd0e2c5d29b52f415bc2',
  measured:{
    command:'node --test tools/ai-factory-dormant-lifecycle.test.cjs',
    tests:6,
    pass:6,
    fail:0,
    durationMs:83.8106,
    cases:{
      A1:0.9851,
      A2:0.1408,
      A3:0.1272,
      A4:0.1203,
      A5:0.0931,
      A6:0.5829
    }
  },
  validatedCapabilities:[
    'validated NEW axis can move to DORMANT without deleting Evidence',
    'DORMANT axis is removed from active Shape while history is retained',
    'independent new Evidence can create REACTIVATE_CANDIDATE without direct FORMAL promotion',
    'harmful reactivation creates SHAPE_RESTORE_CANDIDATE without automatic rollback',
    'Shape Memory alpha restore candidate preserves new failure Evidence',
    'reverse-evolution candidate can be proposed when detection is preserved and cost or false block improves without missed-risk increase'
  ],
  limitations:[
    'Only dedicated E5-F antibodies were executed after implementation.',
    'Full regression has not yet been measured after the lifecycle implementation.',
    'No multi-generation live loop or formal DNA promotion was executed.',
    'Human intervention remains substantial.'
  ],
  falseBlock:0,
  falseNewAxis:0,
  missedRiskObservedInDedicatedRun:0,
  formalPromotionAllowed:false,
  gate:'IMPLEMENTATION_PASS_REGRESSION_PENDING'
});
