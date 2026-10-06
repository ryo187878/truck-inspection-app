'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ctx=require('../auth-context.js');

class MemoryStorage{
  constructor(seed={}){this.map=new Map(Object.entries(seed));}
  getItem(k){return this.map.has(k)?this.map.get(k):null;}
  setItem(k,v){this.map.set(k,String(v));}
  removeItem(k){this.map.delete(k);}
}

test('QRを開いただけではLOGIN_CONTEXTを書かない',()=>{
  const s=new MemoryStorage();
  const reg=ctx.captureRegistrationContext(s,'?register=1&company=c1&office=o1&invite=i1',{now:1000,ttlMs:100});
  assert.equal(reg.companyId,'c1');
  assert.equal(ctx.getLoginContext(s),null);
  assert.equal(ctx.getRegistrationContext(s,{now:1050}).inviteId,'i1');
});

test('REGISTRATION_CONTEXTは期限切れで自動破棄する',()=>{
  const s=new MemoryStorage();
  ctx.captureRegistrationContext(s,'?register=1&company=c1&office=o1&invite=i1',{now:1000,ttlMs:100});
  assert.equal(ctx.getRegistrationContext(s,{now:1101}),null);
  assert.equal(s.getItem(ctx.REGISTRATION_CONTEXT_KEY),null);
});

test('登録成功時だけLOGIN_CONTEXTへ移送しREGISTRATION_CONTEXTを破棄する',()=>{
  const s=new MemoryStorage();
  const reg=ctx.captureRegistrationContext(s,'?register=1&company=c2&office=o2&invite=i2',{now:1000});
  const login=ctx.completeRegistration(s,reg);
  assert.deepEqual(login,{companyId:'c2',officeId:'o2'});
  assert.deepEqual(ctx.getLoginContext(s),{companyId:'c2',officeId:'o2'});
  assert.equal(ctx.getRegistrationContext(s,{now:1001}),null);
});

test('別会社QRを開いても既存LOGIN_CONTEXTは変わらない',()=>{
  const s=new MemoryStorage();
  ctx.saveLoginContext(s,'companyA','officeA');
  ctx.captureRegistrationContext(s,'?register=1&company=companyB&office=officeB&invite=inviteB',{now:1000});
  assert.deepEqual(ctx.getLoginContext(s),{companyId:'companyA',officeId:'officeA'});
  assert.equal(ctx.getRegistrationContext(s,{now:1001}).companyId,'companyB');
});

test('旧登録contextはQRアクセス中でなければ一度だけLOGIN_CONTEXTへ移行する',()=>{
  const legacy=JSON.stringify({companyId:'legacyC',officeId:'legacyO',inviteId:'legacyI'});
  const s=new MemoryStorage({[ctx.REGISTRATION_CONTEXT_KEY]:legacy});
  assert.equal(ctx.migrateLegacyRegistrationContext(s,''),true);
  assert.deepEqual(ctx.getLoginContext(s),{companyId:'legacyC',officeId:'legacyO'});
  assert.equal(s.getItem(ctx.REGISTRATION_CONTEXT_KEY),null);
  assert.equal(ctx.migrateLegacyRegistrationContext(s,''),false);
});

test('新しい登録QRアクセス中は旧contextをLOGIN_CONTEXTへ自動移行しない',()=>{
  const legacy=JSON.stringify({companyId:'legacyC',officeId:'legacyO',inviteId:'legacyI'});
  const s=new MemoryStorage({[ctx.REGISTRATION_CONTEXT_KEY]:legacy});
  assert.equal(ctx.migrateLegacyRegistrationContext(s,'?register=1&company=newC&office=newO&invite=newI'),false);
  assert.equal(ctx.getLoginContext(s),null);
});

test('登録完了後URLから登録用パラメータだけを除去する',()=>{
  const clean=ctx.cleanRegistrationUrl({
    pathname:'/truck-inspection-app/',
    search:'?register=1&company=c&office=o&invite=i&keep=1',
    hash:'#top'
  });
  assert.equal(clean,'/truck-inspection-app/?keep=1#top');
});

test('不正なテナント値は保存しない',()=>{
  const s=new MemoryStorage();
  assert.equal(ctx.saveLoginContext(s,'bad/company','office'),null);
  assert.equal(ctx.captureRegistrationContext(s,'?register=1&company=c&office=o%2Fx&invite=i'),null);
});

test('main/testは通常ログインでLOGIN_CONTEXTのみを使用し、登録成功後にcontextを移送する',()=>{
  const root=path.resolve(__dirname,'..');
  for(const rel of ['index.html','test/index.html']){
    const html=fs.readFileSync(path.join(root,...rel.split('/')),'utf8');
    assert.ok(html.includes(rel==='index.html'?'src="./auth-context.js"':'src="../auth-context.js"'));
    assert.ok(html.includes('const ctx=getLoginTenantContext();'));
    assert.ok(html.includes('completeRegistrationTenantContext(tenantContext);'));
    assert.ok(html.includes('saveLoginTenantContext(profile.companyId,profile.officeId);'));
  }
});
