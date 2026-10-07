'use strict';

module.exports=Object.freeze({
  experiment:'P7-E5-F',
  phase:'ANTIBODY_RED',
  status:'RED_EVIDENCE_FROZEN',
  protocolCommit:'a4b551b649b8c470a7a8257a94080f66813bd8c0',
  antibodyCommit:'5f5676341fbd47e9838f030ecffcebc4b2ada221',
  measured:{
    command:'node --test tools/ai-factory-dormant-lifecycle.test.cjs',
    tests:6,
    pass:0,
    fail:6,
    durationMs:115.9385
  },
  rootCause:{
    lifecycleModulePresent:false,
    missingModule:'tools/ai-factory-dormant-lifecycle.cjs',
    interpretation:'Current AI FACTORY does not yet implement the dormant/reactivation/Shape Memory alpha/reverse-evolution lifecycle. The six failures are implementation-absence RED evidence, not six independent semantic falsifications.'
  },
  antibodyResults:[
    {id:'P7-E5-F-A1',result:'FAIL_RED'},
    {id:'P7-E5-F-A2',result:'FAIL_RED'},
    {id:'P7-E5-F-A3',result:'FAIL_RED'},
    {id:'P7-E5-F-A4',result:'FAIL_RED'},
    {id:'P7-E5-F-A5',result:'FAIL_RED'},
    {id:'P7-E5-F-A6',result:'FAIL_RED'}
  ],
  falseBlock:0,
  falseNewAxis:0,
  newAxisGenerated:0,
  humanIntervention:true,
  formalPromotionAllowed:false,
  gate:'BLOCK_IMPLEMENTATION_ABSENT'
});
