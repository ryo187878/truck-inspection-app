'use strict';

// Protocol sealed before red/green execution. The intervention case has no target-axis label.
module.exports=Object.freeze({
  experiment:'P7-E5-H',
  name:'ETD minimal: unnamed validation target discovery from evidence and Shape contrasts',
  status:'FROZEN_PRE_ANTIBODY',
  upstreamReference:'P7-E5-G e268898859b77eee88a4123aa5b44c29f2d2037a',
  observations:'E5-D redacted MISSED_RISK passed 165/165 with zero candidates; cause/evidence sufficiency not established',
  permittedInput:['unresolved signal and observed change origin','E5-G Evidence roles and independent sources','last-known stable validation graph','observed validation graph','set of guard/check endpoints','confirmed missed-risk outcome'],
  forbiddenInput:['human-named target axis','human proposed detector or fix','identification of which edge changed as an answer','self-certification or promotion'],
  objective:'Infer a WHAT-to-investigate Candidate from verifiable path-coverage losses, rather than from a human-named axis.',
  hypotheses:[
    'Insufficient Evidence leads to REQUEST_MORE/EVIDENCE_FREEZE, not invented target.',
    'A single reproducible loss of tested reachability creates a Target Candidate with linked provenance and falsification plan.',
    'Unrelated or redundant graph changes, inconsistent traces and ambiguous losses never become confident Target Candidates.',
    'Correct Target Candidate does not choose an operation, alter Shape, approve itself or promote DNA.'
  ],
  constraints:['Observe only; no main writes','No executor network calls','Use identical E5-G sufficiency checks','Treat a graph contrast as a hypothesis, not established root cause','Gate must remain external and independent','Keep MISSED_RISK release blocked'],
  metrics:['new-target-candidate precision over controls','freeze/request appropriateness','ambiguous abstention','falsification plan presence','provenance traceability','execution ms','human target hints=0; researcher-designed data/algorithm>0'],
  scopeLimits:['Graph-instrumented validation Shape only','No open-ended ETD, EOD, independent NINJA or real gameplay proved','No full TRAMO regression run in isolated sandbox'],
  formalPromotionAllowed:false,
  gate:'NOT_RUN'
});
