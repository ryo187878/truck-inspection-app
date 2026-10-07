'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-D',
  parentSeries:'P7-E5',
  name:'Missed-Risk to Candidate Autonomy Baseline',
  status:'FROZEN_PRE_RUN',
  baseCommit:'0686312766a58e8c82a4363e845fc8ca2e8febd4',
  branch:'ai-factory-priority7-missed-risk-autonomy-experiment5d',
  purpose:'Measure whether the current unmodified AI FACTORY candidate-generation paths can respond to frozen missed-risk Evidence without a human-provided problem label, target axis name, or detector design.',
  frozenInputs:{
    baselineCommit:'6afead429f9909aeae51f824c5a5d28ae3381c29',
    mutatedEvidenceCommit:'0686312766a58e8c82a4363e845fc8ca2e8febd4',
    evidenceClassification:'MISSED_RISK',
    blindRun:{tests:165,pass:165,fail:0,durationMs:476.4688}
  },
  contaminationControls:[
    'Do not add a new detector before the baseline run.',
    'Do not add a new antibody before the baseline run.',
    'Do not tell the candidate generator the omitted child axis or parent axis.',
    'Do not supply an analyst-proposed axis name.',
    'Do not reinterpret a pre-existing unrelated candidate as a missed-risk response.',
    'Preserve zero-candidate output as Evidence if that is the result.'
  ],
  currentMechanismsToExercise:[
    'tools/ai-factory-generate-axis.cjs',
    'tools/ai-factory-unknown-axis-explorer.cjs'
  ],
  metrics:[
    'candidate count',
    'candidate provenance',
    'candidate proposed tests',
    'relation to frozen missed-risk Evidence',
    'false NEW-axis',
    'human intervention',
    'execution time'
  ],
  interpretationRules:{
    noRelevantCandidate:'AUTONOMY_GAP_BASELINE',
    relevantCandidateWithoutNewDetector:'AUTONOMY_CANDIDATE_EVIDENCE',
    unrelatedCandidate:'do not credit',
    crash:'execution failure evidence'
  },
  formalPromotionAllowed:false,
  gate:'NOT_RUN'
});
