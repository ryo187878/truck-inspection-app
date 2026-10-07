'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-E',
  parentSeries:'P7-E5',
  name:'Generation NEW-Axis Correctness / Effectiveness / Promotion Loop',
  status:'FROZEN_PRE_IMPLEMENTATION',
  baseCommit:'1c7b0b7939856818306fc2f1ac956386bbfc4de5',
  branch:'ai-factory-priority7-new-axis-promotion-experiment5e',

  objective:'When any generation proposes a NEW validation-axis candidate, evaluate whether the axis is wrong or correct, then whether it is actually effective, and only then allow promotion.',

  lifecycle:[
    'NEW_CANDIDATE',
    'CORRECTNESS_REVIEW',
    'VALIDATED_LIMITED',
    'EFFECTIVENESS_REVIEW',
    'PROMOTION_ELIGIBLE',
    'PROMOTED'
  ],

  rejectOrHoldStates:[
    'FALSE_NEW_AXIS',
    'OBSERVE',
    'DORMANT',
    'BLOCKED'
  ],

  correctnessGate:{
    hardGate:true,
    required:[
      'provenance exists',
      'reproducible evidence exists',
      'normal/control case does not trigger incorrectly',
      'counterexample or falsification attempt performed',
      'candidate is not only a rename/duplicate of an existing axis'
    ],
    failureState:'FALSE_NEW_AXIS',
    scoreCannotOverrideFailure:true
  },

  effectivenessGate:{
    requiredMetrics:[
      'additional detection attributable to this axis',
      'missed risk',
      'false block',
      'false NEW-axis',
      'measured validation cost where available',
      'human intervention',
      'reproducibility'
    ],
    scoreBands:{
      '80-100':'strong inheritance candidate',
      '60-79':'conditional inheritance candidate',
      '40-59':'observe',
      '0-39':'dormant'
    },
    oneEvidenceCannotFormalPromote:true
  },

  promotionGate:{
    requirements:[
      'Correctness Gate PASS',
      'antibody tests PASS',
      'Effectiveness evidence is positive',
      'no unresolved missed risk',
      'no unresolved serious false block',
      'repeated or independent Evidence exists'
    ],
    selfApprovalForbidden:true,
    finalHumanGateRequiredInThisExperiment:true
  },

  generationRules:[
    'Each generation may propose NEW axes.',
    'A generation may not formal-promote its own candidate by its own judgment alone.',
    'A wrong candidate must be retained as Evidence rather than deleted.',
    'A correct but ineffective candidate must not be promoted.',
    'A useful candidate with insufficient repeated Evidence remains VALIDATED_LIMITED.',
    'Only promoted axes may enter later-generation inherited DNA.'
  ],

  contaminationControls:[
    'Do not pre-label the expected NEW axis for the first test.',
    'Do not treat novelty score as correctness proof.',
    'Do not convert one successful example directly into formal DNA.',
    'Do not rewrite failed candidate history after later success.'
  ],

  firstImplementationUnit:'Implement one minimal candidate evaluation path and antibody-first tests before any automatic multi-generation rollout.',
  gate:'NOT_RUN'
});
