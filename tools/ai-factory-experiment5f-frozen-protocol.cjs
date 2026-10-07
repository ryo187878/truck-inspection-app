'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-F',
  parentSeries:'P7-E5',
  name:'Dormant DNA / Reverse Evolution / Reactivation with Shape Memory Alpha',
  status:'FROZEN_PRE_ANTIBODY',
  baseCommit:'a8362cb0a1a5d0e5724a2ca58b17f1238f1f4065',
  branch:'ai-factory-priority7-dormant-reactivation-experiment5f',

  baselineFinding:{
    existingDormant:true,
    currentMeaning:'low-current-effectiveness classification only',
    missingLifecycle:['active-shape removal','dormancy history','reactivation candidate','controlled re-inheritance','shape restoration']
  },

  hypothesis:'A validated NEW axis can be made dormant when its current value is low or harmful, removed from the active validation Shape without deleting its Evidence, and later reactivated when new Evidence justifies another controlled inheritance attempt.',

  evolutionActions:['ADD','KEEP','DORMANT','REACTIVATE','RESTORE','BRANCH'],

  dormantRules:[
    'Dormant means capability expression is disabled in the active Shape, not deleted from history.',
    'Correctness Evidence and failure Evidence remain immutable.',
    'A dormant axis cannot silently become formal DNA.',
    'Dormancy may be selected as reverse evolution when removal improves the Shape without increasing missed risk.'
  ],

  reactivationRules:[
    'New independent Evidence is required to propose reactivation.',
    'Reactivation produces a candidate, not direct formal inheritance.',
    'Reactivated axes enter EXPERIMENTAL_INHERITANCE first.',
    'Independent double-check is required.',
    'Shape-stability review is required before formal promotion.'
  ],

  shapeMemoryAlphaRules:[
    'Record the last Gate-approved stable Shape before DORMANT or REACTIVATE transitions.',
    'If the new Shape causes regression, missed risk, false block, or ineffective cost, create a RESTORE candidate.',
    'Do not auto-rollback.',
    'RESTORE requires Gate approval.',
    'After restore, preserve all new failure Evidence.',
    'Principle: 形は戻る。知識は進む。'
  ],

  firstAntibodies:[
    'A correct but ineffective NEW axis can become DORMANT without losing Evidence.',
    'A dormant axis is absent from active inheritance.',
    'New independent Evidence can create REACTIVATE_CANDIDATE but not direct FORMAL.',
    'Reactivation failure creates SHAPE_RESTORE_CANDIDATE.',
    'Restore returns to last stable Shape while preserving new failure Evidence.',
    'Dormancy that reduces cost/false block without raising missed risk may become a new stable reverse-evolution Shape.'
  ],

  formalPromotionAllowed:false,
  gate:'NOT_RUN'
});
