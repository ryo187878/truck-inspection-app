(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  if(root) root.TramoAuthContext=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";

  const REGISTRATION_CONTEXT_KEY="truck_registration_tenant_v1";
  const LOGIN_CONTEXT_KEY="truck_login_tenant_v1";
  const REGISTRATION_TTL_MS=24*60*60*1000;

  function safeStorage(storage){
    if(!storage || typeof storage.getItem!=="function" || typeof storage.setItem!=="function" || typeof storage.removeItem!=="function"){
      throw new Error("storage is required");
    }
    return storage;
  }

  function cleanPart(value){
    return String(value||"").trim();
  }

  function validPart(value){
    const v=cleanPart(value);
    return !!v && !v.includes("/");
  }

  function readJson(storage,key){
    try{return JSON.parse(safeStorage(storage).getItem(key)||"null");}
    catch(_e){return null;}
  }

  function saveRegistrationContext(storage,ctx,{now=Date.now(),ttlMs=REGISTRATION_TTL_MS}={}){
    storage=safeStorage(storage);
    const companyId=cleanPart(ctx?.companyId);
    const officeId=cleanPart(ctx?.officeId);
    const inviteId=cleanPart(ctx?.inviteId);
    if(!validPart(companyId)||!validPart(officeId)||!validPart(inviteId)) return null;
    const createdAt=Number(now);
    const expiresAt=createdAt+Math.max(1,Number(ttlMs)||REGISTRATION_TTL_MS);
    const saved={companyId,officeId,inviteId,createdAt,expiresAt};
    storage.setItem(REGISTRATION_CONTEXT_KEY,JSON.stringify(saved));
    return saved;
  }

  function captureRegistrationContext(storage,search,options={}){
    const params=new URLSearchParams(String(search||""));
    if(params.get("register")!=="1") return null;
    const companyId=cleanPart(params.get("company"));
    const officeId=cleanPart(params.get("office"));
    const inviteId=cleanPart(params.get("invite"));
    if(!validPart(companyId)||!validPart(officeId)||!validPart(inviteId)) return null;
    return saveRegistrationContext(storage,{companyId,officeId,inviteId},options);
  }

  function getRegistrationContext(storage,{now=Date.now()}={}){
    storage=safeStorage(storage);
    const saved=readJson(storage,REGISTRATION_CONTEXT_KEY);
    if(!saved || !validPart(saved.companyId) || !validPart(saved.officeId) || !validPart(saved.inviteId)){
      storage.removeItem(REGISTRATION_CONTEXT_KEY);
      return null;
    }
    const expiresAt=Number(saved.expiresAt);
    if(!Number.isFinite(expiresAt) || expiresAt<=Number(now)){
      storage.removeItem(REGISTRATION_CONTEXT_KEY);
      return null;
    }
    return {
      companyId:cleanPart(saved.companyId),
      officeId:cleanPart(saved.officeId),
      inviteId:cleanPart(saved.inviteId),
      createdAt:Number(saved.createdAt)||0,
      expiresAt
    };
  }

  function clearRegistrationContext(storage){
    safeStorage(storage).removeItem(REGISTRATION_CONTEXT_KEY);
  }

  function saveLoginContext(storage,companyId,officeId){
    storage=safeStorage(storage);
    companyId=cleanPart(companyId);
    officeId=cleanPart(officeId);
    if(!validPart(companyId)||!validPart(officeId)) return null;
    const saved={companyId,officeId};
    storage.setItem(LOGIN_CONTEXT_KEY,JSON.stringify(saved));
    return saved;
  }

  function getLoginContext(storage){
    storage=safeStorage(storage);
    const saved=readJson(storage,LOGIN_CONTEXT_KEY);
    if(!saved || !validPart(saved.companyId) || !validPart(saved.officeId)){
      storage.removeItem(LOGIN_CONTEXT_KEY);
      return null;
    }
    return {companyId:cleanPart(saved.companyId),officeId:cleanPart(saved.officeId)};
  }

  function completeRegistration(storage,ctx){
    const login=saveLoginContext(storage,ctx?.companyId,ctx?.officeId);
    if(!login) return null;
    clearRegistrationContext(storage);
    return login;
  }

  function migrateLegacyRegistrationContext(storage,search){
    storage=safeStorage(storage);
    const params=new URLSearchParams(String(search||""));
    if(params.get("register")==="1") return false;
    if(getLoginContext(storage)) return false;
    const legacy=readJson(storage,REGISTRATION_CONTEXT_KEY);
    if(!legacy || legacy.expiresAt!=null) return false;
    if(!validPart(legacy.companyId)||!validPart(legacy.officeId)||!validPart(legacy.inviteId)){
      storage.removeItem(REGISTRATION_CONTEXT_KEY);
      return false;
    }
    const login=saveLoginContext(storage,legacy.companyId,legacy.officeId);
    if(!login) return false;
    storage.removeItem(REGISTRATION_CONTEXT_KEY);
    return true;
  }

  function cleanRegistrationUrl(locationLike){
    const pathname=String(locationLike?.pathname||"");
    const params=new URLSearchParams(String(locationLike?.search||""));
    ["register","company","office","invite"].forEach(key=>params.delete(key));
    const query=params.toString();
    const hash=String(locationLike?.hash||"");
    return pathname+(query?"?"+query:"")+hash;
  }

  return {
    REGISTRATION_CONTEXT_KEY,
    LOGIN_CONTEXT_KEY,
    REGISTRATION_TTL_MS,
    saveRegistrationContext,
    captureRegistrationContext,
    getRegistrationContext,
    clearRegistrationContext,
    saveLoginContext,
    getLoginContext,
    completeRegistration,
    migrateLegacyRegistrationContext,
    cleanRegistrationUrl
  };
});
