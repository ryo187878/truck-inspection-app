'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {AXES,AXIS_BY_ID,validateRegistry}=require('./ai-factory-axis-registry.cjs');
const selector=require('./ai-factory-select-tests.cjs');

test('軸レジストリはID重複なし・世代・継承先を検証できる',()=>{
  const result=validateRegistry();
  assert.equal(result.pass,true,result.issues.join(', '));
  assert.equal(new Set(AXES.map(x=>x.axisId)).size,AXES.length);
});

test('優先度4のimpact.test-selectionは過去の有効軸を機械可読で継承する',()=>{
  const axis=AXIS_BY_ID.get('impact.test-selection');
  assert.equal(axis.generationIntroduced,51);
  assert.ok(axis.inheritedFrom.includes('promotion.shared-dna'));
  assert.ok(axis.inheritedFrom.includes('auth.context-isolation'));
  assert.ok(axis.inheritedFrom.includes('change.diff-purity'));
});

test('auth-context変更は認証軸だけでなく共有DNAと差分純度を継承選択する',()=>{
  const axes=selector.inferAxes({changedFiles:['auth-context.js']});
  assert.ok(axes.includes('auth.context-isolation'));
  assert.ok(axes.includes('promotion.shared-dna'));
  assert.ok(axes.includes('change.diff-purity'));
});

test('共有DNA FAILはPromotion Gate系テストを選ぶ',()=>{
  const plan=selector.makePlan({failureText:'SHARED_DNA_MISMATCH canonical shared DNA'});
  assert.ok(plan.axes.includes('promotion.shared-dna'));
  assert.ok(plan.targeted.some(x=>x.file==='tools/promotion-gate.test.cjs'));
});

test('枝番FAILは海コン枝番関連テストだけをname patternで狙える',()=>{
  const plan=selector.makePlan({failureText:'枝番 normalization failed'});
  const target=plan.targeted.find(x=>x.file==='tools/verify-release.test.cjs');
  assert.ok(target);
  assert.match(target.namePattern,/枝番/);
  assert.ok(target.exec.args.some(x=>x.startsWith('--test-name-pattern=')));
});

test('tenant異常は会社分離と認証境界の両テスト群を選ぶ',()=>{
  const plan=selector.makePlan({failureText:'他社 companyId tenant isolation failure'});
  assert.ok(plan.axes.includes('tenant.isolation'));
  assert.ok(plan.targeted.some(x=>x.file==='tools/verify-release.test.cjs'));
  assert.ok(plan.targeted.some(x=>x.file==='tools/auth-context.test.cjs'));
});

test('yamato-daily変更はヤマト軸と共有DNA防御を同時に選ぶ',()=>{
  const axes=selector.inferAxes({changedFiles:['yamato-daily.js']});
  assert.ok(axes.includes('yamato.daily'));
  assert.ok(axes.includes('promotion.shared-dna'));
  assert.ok(axes.includes('change.diff-purity'));
});

test('影響を推定できない場合は何も省略せず全回帰へフォールバックする',()=>{
  const plan=selector.makePlan({changedFiles:['unknown/new-feature.txt']});
  assert.equal(plan.fallback,true);
  assert.ok(plan.targeted.length>=4);
  assert.ok(plan.targeted.every(x=>x.file.endsWith('.test.cjs')));
});

test('狙い撃ちテストを選んでもmain昇格前の全回帰は常に必須',()=>{
  const plan=selector.makePlan({explicitAxes:['auth.context-isolation']});
  assert.equal(plan.finalFullRegression.required,true);
  assert.deepEqual(plan.finalFullRegression.args,['--test','tools/*.test.cjs']);
});

test('登録されたname patternは対応テストファイル内のテスト名へ少なくとも1件命中する',()=>{
  const root=path.resolve(__dirname,'..');
  for(const axis of AXES){
    for(const target of axis.testTargets){
      if(target.namePattern==='.*') continue;
      const source=fs.readFileSync(path.join(root,...target.file.split('/')),'utf8');
      const names=[...source.matchAll(/test\(\s*['"`]([^'"`]+)['"`]/g)].map(m=>m[1]);
      const re=new RegExp(target.namePattern,'i');
      assert.ok(names.some(name=>re.test(name)),axis.axisId+' -> '+target.file+' / '+target.namePattern);
    }
  }
});

test('実行計画はshell文字列ではなくcommandとargsを分離して生成する',()=>{
  const plan=selector.makePlan({explicitAxes:['dispatch.branch-normalization']});
  for(const target of plan.targeted){
    assert.equal(typeof target.exec.command,'string');
    assert.ok(Array.isArray(target.exec.args));
    assert.equal(target.exec.args.includes('&&'),false);
  }
});


test('同一テストファイルを複数軸が要求しても1回の実行計画へ統合する',()=>{
  const plan=selector.makePlan({changedFiles:['auth-context.js']});
  const promotion=plan.targeted.filter(x=>x.file==='tools/promotion-gate.test.cjs');
  assert.equal(promotion.length,1);
  assert.ok(promotion[0].axes.includes('auth.context-isolation'));
  assert.ok(promotion[0].axes.includes('promotion.shared-dna'));
  assert.ok(promotion[0].axes.includes('change.diff-purity'));
});
