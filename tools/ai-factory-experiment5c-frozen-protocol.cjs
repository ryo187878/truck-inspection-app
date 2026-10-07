'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-C',
  parentSeries:'P7-E5',
  name:'Unasserted Inheritance Edge Omission',
  status:'FROZEN_PRE_MUTATION',
  baseCommit:'6afead429f9909aeae51f824c5a5d28ae3381c29',
  branch:'ai-factory-priority7-stealth-axis-omission-experiment5c',
  selectionRule:'Choose the earliest-generation registry inheritance edge that is not directly asserted by inheritedFrom.includes(...) in the existing test suite.',
  selectedMutation:{
    childAxis:'promotion.shared-dna',
    childGeneration:31,
    omittedParent:'change.diff-purity',
    field:'inheritedFrom',
    directAssertionFound:false
  },
  baselineObservation:{
    parallelSelectorGuardExists:true,
    note:'The selector contains a separate shared-file rule that can independently add promotion.shared-dna and change.diff-purity. This is recorded before mutation and must not be confused with inheritance-edge detection.'
  },
  blindRules:[
    'Do not add or modify tests before the blind run.',
    'Do not tell any runtime detector to look for the omitted edge.',
    'Do not swap the target after observing the result.',
    'Preserve PASS, FAIL, crash, candidate generation, and silent pass exactly as Evidence.',
    'Do not auto-promote any newly proposed validation axis.'
  ],
  interpretationRules:{
    directOrBehavioralStop:'existing protection detected the omission',
    silentPass:'Missed Risk for an unasserted inheritance edge',
    unexpectedCandidate:'candidate autonomy evidence only',
    crash:'structural dependency evidence'
  },
  mutationApplied:false,
  gate:'NOT_RUN'
});
