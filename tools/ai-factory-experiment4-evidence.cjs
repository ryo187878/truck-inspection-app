'use strict';

module.exports = Object.freeze({
  experiment: 'P7-E4',
  status: 'PASS_EVIDENCE_LIMITED',
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
    },
    {
      id: 'P7-E4-CONTEXT-COLLISION-1',
      classification: 'CROSS_SCOPE_CONTEXT_COLLISION',
      frozen: true,
      measured: {
        tests: 3,
        pass: 2,
        fail: 1,
        durationMs: 89.2059,
        d1Ms: 1.8366,
        d2Ms: 2.8577,
        d3Ms: 0.2341
      },
      fact: 'The candidate appears only when a separate route in the same file contains an unrelated template interpolation using the same identifier name id.',
      implication: 'The detector can correlate same-named identifiers across unrelated scopes/routes, causing a false structural-sink association.',
      correctionApplied: false,
      promotionAllowed: false
    },
    {
      id: 'P7-E4-FIX-VALIDATION-1',
      classification: 'LOCAL_FIX_VALIDATED',
      frozen: true,
      measured: {
        contextDiagnosis: { tests: 3, pass: 3, fail: 0, durationMs: 97.2543 },
        falseNewAxisAntibodies: { tests: 2, pass: 2, fail: 0, durationMs: 65.2035 },
        frozenExternalE4: { tests: 4, pass: 4, fail: 0, durationMs: 66.5503 }
      },
      fact: 'After limiting same-file structural sink matching to local external-input scope, the cross-scope false candidate disappeared, the structural interpolation positive control remained detectable, and all four frozen E4 targets matched expected baseline outputs.',
      correctionApplied: true,
      promotionAllowed: false,
      nextRequiredGate: 'E2/E3 regression plus full regression'
    },
    {
      id: 'P7-E4-FINAL-GATE-1',
      classification: 'FINAL_GATE',
      frozen: true,
      gate: 'PASS_EVIDENCE_LIMITED',
      validationCommitBeforeEvidenceClose: '2880ae9eb4e09f4b3a6dcf63085464d1087885f8',
      measured: {
        e2: { tests: 8, pass: 8, fail: 0, durationMs: 67.0471 },
        e3CrossFile: { tests: 1, pass: 1, fail: 0, durationMs: 82.9164 },
        e3External: { tests: 3, pass: 3, fail: 0, durationMs: 72.5682 },
        fullRegression: { tests: 165, pass: 165, fail: 0, durationMs: 613.0506 }
      },
      falseNewAxisObserved: 1,
      falseNewAxisResolved: 1,
      falseBlockObservedInFinalControls: 0,
      missedRiskObservedInFinalValidation: 0,
      formalDnaPromotion: 0,
      formalNewAxisRegistration: 0,
      actualExternalSoftwareDefectsStopped: 0,
      humanIntervention: true,
      limitations: [
        'External evaluation is static/frozen-source based; no live exploit or runtime vulnerability confirmation was performed.',
        'Human/assistant intervention was substantial in diagnosis, antibody design, and repair.',
        'Passing E4 does not establish autonomous unknown-axis discovery or justify formal DNA promotion.'
      ]
    }
  ]
});
