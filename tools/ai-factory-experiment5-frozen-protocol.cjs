'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5',
  name:'Stealth Axis Omission Experiment',
  status:'FROZEN_PRE_MUTATION',
  baseCommit:'6afead429f9909aeae51f824c5a5d28ae3381c29',
  branch:'ai-factory-priority7-stealth-axis-omission-experiment5',
  hypothesisDisclosureToSystem:false,
  mutationApplied:true,
  selectedOmission:{
    axisId:'change.diff-purity',
    omitFrom:'axis.candidate-generation',
    generationIntroduced:71,
    field:'inheritedFrom',
    mutationMethod:'remove target capability from all inheritance paths reachable by G71 while preserving non-target parents',
    removedCapabilityCount:1,
    removedEdges:4
  },
  selectionReason:[
    'axis.candidate-generation is a later-generation validation capability with multiple inherited parents.',
    'change.diff-purity is not directly listed in axis.candidate-generation.inheritedFrom, while it is reachable transitively through inherited parents.',
    'Removing only the transitive diff-purity safety rail from the generation path tests whether the system notices a required inherited capability becoming absent without being told what to inspect.'
  ],
  blindRules:[
    'Do not tell the system that diff-purity is the omitted capability.',
    'Do not pre-register generation.inheritance-integrity or any equivalent analyst-hypothesis axis.',
    'Do not change the selected target after observing results.',
    'Preserve silent PASS, BLOCK, crash, unexpected candidate, and missed detection as Evidence.',
    'Do not auto-promote any newly proposed axis.'
  ],
  outcomesToRecord:[
    'existing mechanism detects omission',
    'system silently passes',
    'system fails/breaks',
    'system proposes an unexpected candidate',
    'human intervention required'
  ],
  gate:'NOT_RUN'
});
