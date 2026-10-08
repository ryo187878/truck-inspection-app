'use strict';

// E5-I protocol is written BEFORE the antibody suite and implementation.
module.exports=Object.freeze({
  experiment:'P7-E5-I',
  parent:'P7-E5-H',
  name:'Evolution Operation Discovery: HOW from reviewed WHAT',
  phase:'FROZEN_BEFORE_ANTIBODY',
  parentCommit:'9a633ffdc804fba44076aa814581a4ef33739bc0',
  researchBranchPlanned:'ai-factory-priority7-eod-experiment5i',
  objective:'Given verified Evidence and an ETD-discovered target, generate bounded, falsifiable HOW candidates without human-provided operation labels and without changing live code.',
  priorGates:['P7-E5-G Evidence role sufficiency','P7-E5-H limited Shape-graph ETD'],
  candidateOperations:['ADD','REACTIVATE','RESTORE'],
  allowedInput:'Signal, verified Evidence, two independently attributed target review attestations, frozen before/current validation Shape, optional dormant-capability record and Gate-approved stable Shape, and safety constraints. Never an explicitly selected operation.',
  invariants:[
    'Never run EOD on an invented, unreviewed or rejected ETD Target.',
    'An operation is not a target and a target is not an operation.',
    'Use counterfactual reachability and healthy-check preservation to filter proposals.',
    'Never silently replace a DORMANT capability by ADD. New independent Evidence is needed for REACTIVATE.',
    'RESTORE is only a candidate from explicitly Gate-approved stable Shape; no automatic rollback.',
    'Equivalent viable operations produce OPERATION_AMBIGUOUS, never arbitrary self-selection.',
    'If no viable operation and Evidence/search budget is exhausted, EVIDENCE_FREEZE problem and preserve evidence.',
    'MISSED_RISK stays release-blocking until independent full correction is demonstrated.',
    'No change, git commit, git push, DNA formal promotion, main update or self approval.'
  ],
  testsPlanned:[
    'A0 no target Evidence yields no operation',
    'A1 target review missing is blocked',
    'A2 review disagreement or duplicate source blocked',
    'A3 independently reviewed Target yields unnamed ADD candidate and concrete falsification tests',
    'A4 different topology yields different operation recipe without hints',
    'A5 dormant unverified cannot be bypassed with ADD',
    'A6 dormant + new independent supporting Evidence yields REACTIVATE_CANDIDATE, not ACTIVE',
    'A7 Gate-approved stable Shape permits RESTORE candidate when graph patches prohibited',
    'A8 unapproved restore is not permitted',
    'A9 multiple equally viable operation types remain AMBIGUOUS',
    'A10 weak upstream Evidence stays frozen',
    'A11 unrelated Shape edit cannot claim outcome',
    'A12 deterministic output and no direct mutation',
    'A13 independent audit that rejects target must STOP',
    'A14 search-budget exhausted without admissible candidate freezes problem',
    'A15 severe missed risk remains release-blocking',
    'A16 healthy controls cannot be sacrificed by candidate',
    'A17 false/duplicate evidence cannot justify REACTIVATE'
  ],
  excludedClaims:['General autonomous software repair not proven','Independent NINJA actually executed not proven by attestation-shaped test input','External-game transfer not proven','Measured effectiveness/cost reduction not proven'],
  promotionAllowed:false,
  gate:'NOT_RUN'
});
