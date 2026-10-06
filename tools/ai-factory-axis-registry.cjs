'use strict';

const AXES=[
  {
    axisId:'change.diff-purity',
    label:'差分純度',
    generationIntroduced:21,
    inheritedFrom:[],
    changedPaths:['index.html','test/index.html','dispatch-service.js','auth-context.js'],
    failurePatterns:['unrelated diff','差分純度','想定外差分','diff purity'],
    testTargets:[
      {file:'tools/promotion-gate.test.cjs',namePattern:'共有DNA|共有ファイル|Gate|auth context'}
    ]
  },
  {
    axisId:'dispatch.branch-normalization',
    label:'海コン枝番正規化',
    generationIntroduced:21,
    inheritedFrom:[],
    changedPaths:['dispatch-service.js','index.html','test/index.html'],
    failurePatterns:['枝番','branch','normaliz','車番','乗務員'],
    testTargets:[
      {file:'tools/verify-release.test.cjs',namePattern:'Vaccine1:|枝番|案件・枝番|一般物2台×2工程|同一台枠工程|海コン親案件'}
    ]
  },
  {
    axisId:'promotion.shared-dna',
    label:'共有DNA・正本化',
    generationIntroduced:31,
    inheritedFrom:['change.diff-purity'],
    changedPaths:['dispatch-service.js','today-vehicle-status.js','yamato-daily.js','auth-context.js','tools/promotion-gate.cjs'],
    failurePatterns:['shared dna','共有DNA','canonical','正本','duplicate shared','promotion gate'],
    testTargets:[
      {file:'tools/promotion-gate.test.cjs',namePattern:'.*'}
    ]
  },
  {
    axisId:'auth.context-isolation',
    label:'登録・通常ログインContext分離',
    generationIntroduced:41,
    inheritedFrom:['promotion.shared-dna','change.diff-purity'],
    changedPaths:['auth-context.js','index.html','test/index.html'],
    failurePatterns:['login_context','registration_context','login context','registration context','登録QR','認証','tenant context'],
    testTargets:[
      {file:'tools/auth-context.test.cjs',namePattern:'.*'},
      {file:'tools/promotion-gate.test.cjs',namePattern:'auth context|共有DNA|共有ファイル'}
    ]
  },
  {
    axisId:'tenant.isolation',
    label:'会社・営業所分離',
    generationIntroduced:51,
    inheritedFrom:['auth.context-isolation'],
    changedPaths:['firestore.rules','index.html','test/index.html'],
    failurePatterns:['他社','他営業所','tenant','companyId','officeId','会社分離'],
    testTargets:[
      {file:'tools/verify-release.test.cjs',namePattern:'他社|他営業所|会社パス|会社の記録|Firebase読取'},
      {file:'tools/auth-context.test.cjs',namePattern:'別会社QR|不正なテナント値|LOGIN_CONTEXT'}
    ]
  },
  {
    axisId:'dispatch.lifecycle',
    label:'配車ライフサイクル',
    generationIntroduced:51,
    inheritedFrom:['dispatch.branch-normalization'],
    changedPaths:['dispatch-service.js','index.html','test/index.html'],
    failurePatterns:['先行','終了日','過去検索','配車マスター','boardQueryKey','dispatch lifecycle'],
    testTargets:[
      {file:'tools/verify-release.test.cjs',namePattern:'先行|終了日|過去検索|通常マスター|区分のない既存先行|着日訂正'}
    ]
  },
  {
    axisId:'ui.integrity',
    label:'UI・HTML整合性',
    generationIntroduced:51,
    inheritedFrom:['change.diff-purity'],
    changedPaths:['index.html','test/index.html'],
    failurePatterns:['構文','duplicate id','id一意','autocomplete','入力画面','ui'],
    testTargets:[
      {file:'tools/verify-release.test.cjs',namePattern:'JavaScript構文|ID一意性|入力画面|配車マスターは発地|運転者は配車'}
    ]
  },
  {
    axisId:'yamato.daily',
    label:'ヤマト日次処理',
    generationIntroduced:51,
    inheritedFrom:['promotion.shared-dna'],
    changedPaths:['yamato-daily.js'],
    failurePatterns:['yamato','ヤマト'],
    testTargets:[
      {file:'tools/yamato-daily.test.cjs',namePattern:'.*'}
    ]
  },
  {
    axisId:'impact.test-selection',
    label:'影響範囲連動テスト選択',
    generationIntroduced:51,
    inheritedFrom:['promotion.shared-dna','auth.context-isolation','change.diff-purity'],
    changedPaths:['tools/ai-factory-axis-registry.cjs','tools/ai-factory-select-tests.cjs'],
    failurePatterns:['selector','test selection','影響範囲','テスト選択'],
    testTargets:[
      {file:'tools/ai-factory-select-tests.test.cjs',namePattern:'.*'}
    ]
  }
,
  {
    axisId:'axis.effectiveness-scoring',
    label:'Evidenceベース検証軸有効度',
    generationIntroduced:61,
    inheritedFrom:['impact.test-selection','promotion.shared-dna','auth.context-isolation','change.diff-purity'],
    changedPaths:['tools/ai-factory-evidence-ledger.cjs','tools/ai-factory-score-axes.cjs'],
    failurePatterns:['effectiveness','有効度','evidence score','axis score','継承候補'],
    testTargets:[
      {file:'tools/ai-factory-score-axes.test.cjs',namePattern:'.*'}
    ]
  }
,
  {
    axisId:'axis.candidate-generation',
    label:'新規検証軸候補生成・メタ検証',
    generationIntroduced:71,
    inheritedFrom:['axis.effectiveness-scoring','impact.test-selection','promotion.shared-dna'],
    changedPaths:['tools/ai-factory-generate-axis.cjs','tools/ai-factory-generate-axis.test.cjs'],
    failurePatterns:['new validation axis','新規検証軸','axis candidate','novel axis','meta validation'],
    testTargets:[
      {file:'tools/ai-factory-generate-axis.test.cjs',namePattern:'.*'}
    ]
  }
];

const AXIS_BY_ID=new Map(AXES.map(axis=>[axis.axisId,axis]));

function validateRegistry(){
  const issues=[];
  const seen=new Set();
  for(const axis of AXES){
    if(!axis.axisId || seen.has(axis.axisId)) issues.push('duplicate-or-empty-axis:'+axis.axisId);
    seen.add(axis.axisId);
    if(!Number.isInteger(axis.generationIntroduced) || axis.generationIntroduced<1){
      issues.push('invalid-generation:'+axis.axisId);
    }
    if(!Array.isArray(axis.inheritedFrom)) issues.push('invalid-inheritance:'+axis.axisId);
    if(!Array.isArray(axis.testTargets) || axis.testTargets.length===0) issues.push('missing-tests:'+axis.axisId);
  }
  for(const axis of AXES){
    for(const parent of axis.inheritedFrom||[]){
      if(!AXIS_BY_ID.has(parent)) issues.push('unknown-parent:'+axis.axisId+':'+parent);
      else if(AXIS_BY_ID.get(parent).generationIntroduced>axis.generationIntroduced){
        issues.push('future-parent:'+axis.axisId+':'+parent);
      }
    }
  }
  return {pass:issues.length===0,issues};
}

module.exports={AXES,AXIS_BY_ID,validateRegistry};
