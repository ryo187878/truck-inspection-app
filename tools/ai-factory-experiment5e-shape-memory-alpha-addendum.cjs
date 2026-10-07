'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-E',
  addendum:'SHAPE_MEMORY_ALPHA_DOUBLE_CHECK',
  status:'FROZEN_PRE_IMPLEMENTATION',
  rationale:'A NEW axis must be evaluated not only before inheritance, but also after inheritance under a double-check generation before it can be considered stable.',

  revisedLifecycle:[
    'NEW_CANDIDATE',
    'CORRECTNESS_REVIEW',
    'VALIDATED_LIMITED',
    'EFFECTIVENESS_REVIEW',
    'EXPERIMENTAL_INHERITANCE',
    'DOUBLE_CHECK',
    'SHAPE_STABILITY_REVIEW',
    'PROMOTION_ELIGIBLE',
    'PROMOTED'
  ],

  experimentalInheritance:{
    formalDNA:false,
    purpose:'Allow the candidate axis to enter a controlled next-generation validation shape so its real interaction cost and breakage can be observed.',
    stableShapeMustBeRecordedBeforeInheritance:true
  },

  doubleCheck:{
    independent:true,
    compare:[
      'stable pre-inheritance shape',
      'candidate-inherited shape'
    ],
    evaluate:[
      'correctness after inheritance',
      'additional detection',
      'missed risk',
      'false block',
      'false NEW-axis',
      'regression breakage',
      'validation cost',
      'human intervention'
    ]
  },

  shapeMemoryAlpha:{
    role:'restore a previously Gate-approved stable validation shape when the candidate-inherited shape is shown to be wrong, harmful, or ineffective',
    automaticDirectRollback:false,
    restorationIsCandidate:true,
    restorationRequiresGate:true,
    preserveFailureEvidence:true,
    preserveCandidateHistory:true,
    principle:'形は戻る。知識は進む。'
  },

  failureHandling:{
    incorrectCandidate:'FALSE_NEW_AXIS',
    effectiveBeforeInheritanceButHarmfulAfterInheritance:'BLOCKED_AFTER_INHERITANCE',
    correctButNotEffective:'DORMANT_OR_OBSERVE',
    regressionBreakage:'SHAPE_RESTORE_CANDIDATE',
    restoredShape:'LAST_STABLE_SHAPE_PLUS_NEW_FAILURE_EVIDENCE'
  },

  promotionRule:'Only a candidate that survives correctness, effectiveness, experimental inheritance, independent double-check, and shape-stability review may become formal inherited DNA.',

  selfApprovalForbidden:true,
  humanFinalGateRequired:true
});
