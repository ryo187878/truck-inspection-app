'use strict';

module.exports = Object.freeze({
  experiment: 'P7-E4',
  status: 'IN_PROGRESS',
  baselineCommit: '601eef6a85e46595655490242a7c9af381cc8e0a',
  traceCommit: '2af2e9ced01e5594a38484b70d3e1ee16a22ce03',
  measuredBaseline: {
    firstRun: {
      tests: 4,
      pass: 3,
      fail: 1,
      durationMs: 116.9623,
      postgresParameterizedDurationMs: 2.5369
    },
    traceRun: {
      tests: 4,
      pass: 3,
      fail: 1,
      durationMs: 95.9039,
      postgresParameterizedDurationMs: 1.8137
    }
  },
  evidence: [
    {
      id: 'P7-E4-FALSE-NEW-AXIS-1',
      classification: 'FALSE_NEW_AXIS_CANDIDATE',
      frozen: true,
      target: 'umagol/nodejs-postgresql',
      commit: '7d3e10e0086afda6310c554c4bb5a02927fcb66a',
      path: 'server.js',
      explorerInput: 'id',
      candidateAxisId: 'boundary.structural-input-separation',
      novelty: {
        nearestAxisId: 'boundary.server-domain-enforcement',
        similarity: 0.031,
        noveltyScore: 0.969
      },
      observedSourceStructure: 'req.params.id is parsed and used in PostgreSQL parameterized SQL with $1 placeholder and [id] values array.',
      reason: 'The Explorer emitted a structural-input candidate even though the observed SQL shape uses parameter binding rather than external input changing the SQL structure.',
      impact: 'Novelty scoring alone is insufficient to validate a NEW axis candidate. Correctness/guard semantics require separate evidence.',
      correctionApplied: false,
      promotionAllowed: false
    },
    {
      id: 'P7-E4-REDUCTION-NONREPRO-1',
      classification: 'REDUCTION_NON_REPRODUCTION',
      frozen: true,
      sourceEvidenceId: 'P7-E4-FALSE-NEW-AXIS-1',
      measured: {
        tests: 2,
        pass: 2,
        fail: 0,
        durationMs: 82.5608,
        parameterBindingTestMs: 1.3942,
        structuralInterpolationTestMs: 0.7799
      },
      fact: 'A minimal PostgreSQL $1 + [id] parameter-binding case does not reproduce the external full-source candidate, while structural interpolation remains detectable.',
      implication: 'The external candidate is not explained by parameter binding alone; file-level context or another statement/path in the frozen source contributes to detection.',
      correctionApplied: false,
      promotionAllowed: false
    }
  ]
});
