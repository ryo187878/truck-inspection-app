const assert = require("node:assert/strict");
const { before, after, beforeEach, test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails
} = require("@firebase/rules-unit-testing");
const {
  doc,
  getDoc,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch
} = require("firebase/firestore");

const PROJECT_ID = "truck-inspection-app-rules-tests";
const COMPANY_ID = "company-a";
const OFFICE_ID = "office-a";
const OTHER_COMPANY_ID = "company-b";
const OTHER_OFFICE_ID = "office-b";
const ADMIN_UID = "admin-a";
const OTHER_COMPANY_ADMIN_UID = "admin-b";
const OTHER_OFFICE_ADMIN_UID = "admin-c";
const DRIVER_UID = "driver-a";
const REGISTRATION_PATH = `companies/${COMPANY_ID}/offices/${OFFICE_ID}/registrationRequests/${DRIVER_UID}`;
const USER_PATH = `users/${DRIVER_UID}`;

let testEnv;

function emulatorAddress() {
  const value = process.env.FIRESTORE_EMULATOR_HOST;
  assert.ok(
    value,
    "FIRESTORE_EMULATOR_HOST must be set, for example 127.0.0.1:8080"
  );
  const match = value.match(/^(?:https?:\/\/)?([^:]+):(\d+)$/);
  assert.ok(match, `Invalid FIRESTORE_EMULATOR_HOST: ${value}`);
  return { host: match[1], port: Number(match[2]) };
}

function registrationRequest(overrides = {}) {
  return {
    displayName: "Driver A",
    loginId: "driver-a",
    role: "driver",
    companyId: COMPANY_ID,
    officeId: OFFICE_ID,
    status: "pending",
    createdAt: "2026-09-19T00:00:00.000Z",
    ...overrides
  };
}

function adminProfile(companyId = COMPANY_ID, officeId = OFFICE_ID) {
  return {
    role: "admin",
    companyId,
    officeId,
    displayName: "Admin",
    loginId: "admin"
  };
}

function driverProfile(overrides = {}) {
  return {
    role: "driver",
    companyId: COMPANY_ID,
    officeId: OFFICE_ID,
    displayName: "Driver A",
    loginId: "driver-a",
    approvedAt: "2026-09-19T00:00:00.000Z",
    ...overrides
  };
}

async function seedBase({ adminUid = ADMIN_UID, adminCompany = COMPANY_ID, adminOffice = OFFICE_ID, request = {}, existingUser } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${adminUid}`), adminProfile(adminCompany, adminOffice));
    await setDoc(doc(db, REGISTRATION_PATH), registrationRequest(request));
    if (existingUser) {
      await setDoc(doc(db, USER_PATH), existingUser);
    }
  });
}

function adminDb(uid = ADMIN_UID) {
  return testEnv.authenticatedContext(uid).firestore();
}

async function approveBatch(db, userData = driverProfile(), requestData = {}) {
  const batch = writeBatch(db);
  batch.set(doc(db, USER_PATH), userData);
  batch.update(doc(db, REGISTRATION_PATH), {
    status: "approved",
    approvedAt: "2026-09-19T01:00:00.000Z",
    approvedBy: ADMIN_UID,
    ...requestData
  });
  return batch.commit();
}

before(async () => {
  const { host, port } = emulatorAddress();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host,
      port,
      rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

test("1. 正しいadminは申請承認とdriverプロフィール作成を同じwriteBatchで実行できる", async () => {
  await seedBase();
  await assertSucceeds(approveBatch(adminDb()));
});

test("2. users/{uid}だけのdriverプロフィール作成は拒否される", async () => {
  await seedBase();
  const db = adminDb();
  await assertFails(setDoc(doc(db, USER_PATH), driverProfile()));
});

test("3. registrationRequestsだけのapproved更新は拒否される", async () => {
  await seedBase();
  const db = adminDb();
  await assertFails(updateDoc(doc(db, REGISTRATION_PATH), {
    status: "approved",
    approvedAt: "2026-09-19T01:00:00.000Z",
    approvedBy: ADMIN_UID
  }));
});

test("4. 他社adminによる申請承認は拒否される", async () => {
  await seedBase({ adminUid: OTHER_COMPANY_ADMIN_UID, adminCompany: OTHER_COMPANY_ID, adminOffice: OFFICE_ID });
  await assertFails(approveBatch(adminDb(OTHER_COMPANY_ADMIN_UID)));
});

test("5. 他営業所adminによる申請承認は拒否される", async () => {
  await seedBase({ adminUid: OTHER_OFFICE_ADMIN_UID, adminCompany: COMPANY_ID, adminOffice: OTHER_OFFICE_ID });
  await assertFails(approveBatch(adminDb(OTHER_OFFICE_ADMIN_UID)));
});

test("6. 運転者本人による自分のdriverプロフィール作成は拒否される", async () => {
  await seedBase({ adminUid: DRIVER_UID });
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), `users/${DRIVER_UID}`), driverProfile());
  });
  await assertFails(setDoc(doc(adminDb(DRIVER_UID), `users/${DRIVER_UID}`), driverProfile()));
});

test("7. driver作成時のrole adminへの変更は拒否される", async () => {
  await seedBase();
  await assertFails(approveBatch(adminDb(), driverProfile({ role: "admin" })));
});

test("8. driverプロフィールへのisTrialなど余計なフィールド追加は拒否される", async () => {
  await seedBase();
  await assertFails(approveBatch(adminDb(), driverProfile({ isTrial: true })));
});

test("9. driverプロフィールのcompanyId改ざんは拒否される", async () => {
  await seedBase();
  await assertFails(approveBatch(adminDb(), driverProfile({ companyId: OTHER_COMPANY_ID })));
});

test("10. driverプロフィールのofficeId改ざんは拒否される", async () => {
  await seedBase();
  await assertFails(approveBatch(adminDb(), driverProfile({ officeId: OTHER_OFFICE_ID })));
});

test("11. approvedByが実際のadmin UID以外なら拒否される", async () => {
  await seedBase();
  await assertFails(approveBatch(adminDb(), driverProfile(), { approvedBy: "another-admin" }));
});

test("12. 正しいadminはpending申請をrejectedへ更新できる", async () => {
  await seedBase();
  await assertSucceeds(updateDoc(doc(adminDb(), REGISTRATION_PATH), {
    status: "rejected",
    rejectedAt: "2026-09-19T01:00:00.000Z",
    rejectedBy: ADMIN_UID
  }));
});

test("13. rejected更新時に申請内容を同時改ざんすると拒否される", async () => {
  await seedBase();
  await assertFails(updateDoc(doc(adminDb(), REGISTRATION_PATH), {
    status: "rejected",
    rejectedAt: "2026-09-19T01:00:00.000Z",
    rejectedBy: ADMIN_UID,
    companyId: OTHER_COMPANY_ID
  }));
});

test("14. 既存users/{uid}の上書きは拒否される", async () => {
  await seedBase({ existingUser: driverProfile({ displayName: "Existing Driver" }) });
  await assertFails(approveBatch(adminDb(), driverProfile({ displayName: "Overwritten Driver" })));
});

test("15. trial adminの既存作成フローは成功する", async () => {
  const trialAdminUid = "trial-admin";
  const db = testEnv.authenticatedContext(trialAdminUid).firestore();
  await assertSucceeds(setDoc(doc(db, `companies/trial-${trialAdminUid}`), {
    isTrial: true,
    vehicleLimit: 5
  }));
  await assertSucceeds(setDoc(doc(db, `users/${trialAdminUid}`), {
    role: "admin",
    companyId: `trial-${trialAdminUid}`,
    officeId: "main",
    isTrial: true
  }));
});

test("16. 存在しない会社・営業所への運転者登録申請は拒否される", async () => {
  const uid = "unregistered-driver";
  const companyId = "company-does-not-exist";
  const officeId = "office-does-not-exist";
  const db = testEnv.authenticatedContext(uid).firestore();
  const requestPath = `companies/${companyId}/offices/${officeId}/registrationRequests/${uid}`;

  await assertFails(setDoc(doc(db, requestPath), {
    role: "driver",
    status: "pending",
    companyId,
    officeId
  }));
});

test("17. A社のdriverはB社のvehicleを読み取れない", async () => {
  const driverUid = "company-a-driver";
  const driverCompanyId = "company-a";
  const driverOfficeId = "office-main";
  const vehicleCompanyId = "company-b";
  const vehicleOfficeId = "office-main";
  const vehicleId = "vehicle-b-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId: driverCompanyId,
      officeId: driverOfficeId,
      displayName: "Company A Driver",
      loginId: "company-a-driver"
    });
    await setDoc(doc(db, `companies/${vehicleCompanyId}/offices/${vehicleOfficeId}/vehicles/${vehicleId}`), {
      name: "B社車両"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(getDoc(doc(
    driverDb,
    `companies/${vehicleCompanyId}/offices/${vehicleOfficeId}/vehicles/${vehicleId}`
  )));
});

test("18. A社のdriverはB社のinspectionを読み取れない", async () => {
  const driverUid = "company-a-inspection-driver";
  const driverCompanyId = "company-a";
  const driverOfficeId = "office-main";
  const inspectionCompanyId = "company-b";
  const inspectionOfficeId = "office-main";
  const inspectionId = "inspection-b-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId: driverCompanyId,
      officeId: driverOfficeId,
      displayName: "Company A Inspection Driver",
      loginId: "company-a-inspection-driver"
    });
    await setDoc(doc(db, `companies/${inspectionCompanyId}/offices/${inspectionOfficeId}/inspections/${inspectionId}`), {
      vehicle: "B社車両",
      overall: "良好"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(getDoc(doc(
    driverDb,
    `companies/${inspectionCompanyId}/offices/${inspectionOfficeId}/inspections/${inspectionId}`
  )));
});

test("19. A社のadminはB社のinspectionを更新できない", async () => {
  const adminUid = "company-a-admin";
  const adminCompanyId = "company-a";
  const adminOfficeId = "office-main";
  const inspectionCompanyId = "company-b";
  const inspectionOfficeId = "office-main";
  const inspectionId = "inspection-b-update-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${adminUid}`), {
      role: "admin",
      companyId: adminCompanyId,
      officeId: adminOfficeId,
      displayName: "Company A Admin",
      loginId: "company-a-admin"
    });
    await setDoc(doc(db, `companies/${inspectionCompanyId}/offices/${inspectionOfficeId}/inspections/${inspectionId}`), {
      vehicle: "B社車両",
      overall: "良好"
    });
  });

  const adminDb = testEnv.authenticatedContext(adminUid).firestore();
  await assertFails(updateDoc(
    doc(adminDb, `companies/${inspectionCompanyId}/offices/${inspectionOfficeId}/inspections/${inspectionId}`),
    { overall: "異常" }
  ));
});

test("20. A社のdriverはB社のinspectionを新規作成できない", async () => {
  const driverUid = "company-a-inspection-create-driver";
  const driverCompanyId = "company-a";
  const driverOfficeId = "office-main";
  const inspectionCompanyId = "company-b";
  const inspectionOfficeId = "office-main";
  const inspectionId = "inspection-b-create-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId: driverCompanyId,
      officeId: driverOfficeId,
      displayName: "Company A Inspection Create Driver",
      loginId: "company-a-inspection-create-driver"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(setDoc(
    doc(driverDb, `companies/${inspectionCompanyId}/offices/${inspectionOfficeId}/inspections/${inspectionId}`),
    {
      vehicle: "B社車両",
      overall: "良好"
    }
  ));
});

test("21. 運転者本人による余計なフィールド付き登録申請は拒否される", async () => {
  const driverUid = "registration-extra-field-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const requestPath = `companies/${companyId}/offices/${officeId}/registrationRequests/${driverUid}`;

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `companies/${companyId}`), {
      name: "Company A"
    });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}`), {
      name: "Main Office"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(setDoc(doc(driverDb, requestPath), {
    ...registrationRequest({ companyId, officeId }),
    isAdmin: true
  }));
});

test("22. 同じ会社のdriverは別営業所のvehicleを読み取れない", async () => {
  const driverUid = "company-a-office-main-driver";
  const companyId = "company-a";
  const driverOfficeId = "office-main";
  const vehicleOfficeId = "office-sub";
  const vehicleId = "vehicle-office-sub-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId,
      officeId: driverOfficeId,
      displayName: "Company A Main Office Driver",
      loginId: "company-a-office-main-driver"
    });
    await setDoc(doc(db, `companies/${companyId}/offices/${vehicleOfficeId}/vehicles/${vehicleId}`), {
      name: "Company A Sub Office Vehicle"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(getDoc(doc(
    driverDb,
    `companies/${companyId}/offices/${vehicleOfficeId}/vehicles/${vehicleId}`
  )));
});

test("23. A社のdriverはB社のsettingsを読み取れない", async () => {
  const driverUid = "company-a-settings-driver";
  const driverCompanyId = "company-a";
  const driverOfficeId = "office-main";
  const settingsCompanyId = "company-b";
  const settingsOfficeId = "office-main";
  const settingId = "settings-b-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId: driverCompanyId,
      officeId: driverOfficeId,
      displayName: "Company A Settings Driver",
      loginId: "company-a-settings-driver"
    });
    await setDoc(doc(db, `companies/${settingsCompanyId}/offices/${settingsOfficeId}/settings/${settingId}`), {
      enabled: true
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(getDoc(doc(
    driverDb,
    `companies/${settingsCompanyId}/offices/${settingsOfficeId}/settings/${settingId}`
  )));
});

test("24. driverはinspectionに余計なフィールドを追加して新規作成できない", async () => {
  const driverUid = "company-a-inspection-field-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inspectionId = "inspection-extra-field-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId,
      officeId,
      displayName: "Company A Inspection Field Driver",
      loginId: "company-a-inspection-field-driver"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(setDoc(
    doc(driverDb, `companies/${companyId}/offices/${officeId}/inspections/${inspectionId}`),
    {
      id: inspectionId,
      date: "2026-09-19",
      vehicle: "A社車両",
      driver: "Driver A",
      shaken: "確認済み",
      shakenConfirmed: true,
      managerConfirmedBy: "",
      managerConfirmedRole: "",
      results: {},
      overall: "良好",
      abnormal: "",
      previous: "",
      today: "",
      driverChange: false,
      previousDriverReport: "",
      savedAt: "2026-09-19T00:00:00.000Z",
      companyId,
      officeId,
      cloudUpdatedAt: "2026-09-19T00:00:00.000Z",
      isAdmin: true
    }
  ));
});

test("25. 正しい所属のdriverは正常なinspectionを新規作成できる", async () => {
  const driverUid = "company-a-inspection-valid-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inspectionId = "inspection-valid-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId,
      officeId,
      displayName: "Company A Valid Inspection Driver",
      loginId: "company-a-inspection-valid-driver"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertSucceeds(setDoc(
    doc(driverDb, `companies/${companyId}/offices/${officeId}/inspections/${inspectionId}`),
    {
      id: inspectionId,
      date: "2026-09-19",
      vehicle: "A社車両",
      driver: "Driver A",
      shaken: "確認済み",
      shakenConfirmed: true,
      managerConfirmedBy: "",
      managerConfirmedRole: "",
      results: {},
      overall: "良好",
      abnormal: "",
      previous: "",
      today: "",
      driverChange: false,
      previousDriverReport: "",
      savedAt: "2026-09-19T00:00:00.000Z",
      companyId,
      officeId,
      cloudUpdatedAt: "2026-09-19T00:00:00.000Z"
    }
  ));
});

test("26. driverはinspectionのcompanyIdを保存先と異なる値に偽装できない", async () => {
  const driverUid = "company-a-inspection-company-id-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inspectionId = "inspection-forged-company-id-1";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${driverUid}`), {
      role: "driver",
      companyId,
      officeId,
      displayName: "Company A Forged Company ID Driver",
      loginId: "company-a-inspection-company-id-driver"
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(setDoc(
    doc(driverDb, `companies/${companyId}/offices/${officeId}/inspections/${inspectionId}`),
    {
      id: inspectionId,
      date: "2026-09-19",
      vehicle: "A社車両",
      driver: "Driver A",
      shaken: "確認済み",
      shakenConfirmed: true,
      managerConfirmedBy: "",
      managerConfirmedRole: "",
      results: {},
      overall: "良好",
      abnormal: "",
      previous: "",
      today: "",
      driverChange: false,
      previousDriverReport: "",
      savedAt: "2026-09-19T00:00:00.000Z",
      companyId: "company-b",
      officeId,
      cloudUpdatedAt: "2026-09-19T00:00:00.000Z"
    }
  ));
});

test("27. 同じ会社・営業所のadminは自社のactive inviteを作成できる", async () => {
  const adminUid = "company-a-invite-admin";
  const companyId = "company-a";
  const officeId = "office-main";
  const inviteId = "invite-8f4e2a7c9d1b6e3f5a0c4d8e7b2f6a1c";

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `users/${adminUid}`), {
      role: "admin",
      companyId,
      officeId,
      displayName: "Company A Invite Admin",
      loginId: "company-a-invite-admin"
    });
  });

  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const createdAt = Timestamp.fromMillis(Date.now());
  const adminDbInstance = testEnv.authenticatedContext(adminUid).firestore();
  await assertSucceeds(setDoc(
    doc(adminDbInstance, `companies/${companyId}/offices/${officeId}/invites/${inviteId}`),
    {
      companyId,
      officeId,
      status: "active",
      expiresAt,
      createdAt,
      createdBy: adminUid,
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      revokedBy: null
    }
  ));
});

test("28. 未承認driverは自社のactive inviteを使って申請と消費を同一Batchで実行できる", async () => {
  const driverUid = "company-a-invite-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inviteId = "invite-1c7e9a4b2d6f8e0a3c5b7d9f1e4a6c8b";
  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const createdAt = Timestamp.fromMillis(Date.now());
  const usedAt = Timestamp.fromMillis(Date.now());

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `companies/${companyId}`), { name: "Company A" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}`), { name: "Main Office" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}/invites/${inviteId}`), {
      companyId,
      officeId,
      status: "active",
      expiresAt,
      createdAt,
      createdBy: "company-a-invite-admin",
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      revokedBy: null
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  const batch = writeBatch(driverDb);
  batch.set(doc(
    driverDb,
    `companies/${companyId}/offices/${officeId}/registrationRequests/${driverUid}`
  ), {
    displayName: "Invited Driver",
    loginId: "invited-driver",
    role: "driver",
    companyId,
    officeId,
    status: "pending",
    createdAt: "2026-09-19T00:00:00.000Z",
    inviteId
  });
  batch.update(doc(
    driverDb,
    `companies/${companyId}/offices/${officeId}/invites/${inviteId}`
  ), {
    companyId,
    officeId,
    status: "used",
    expiresAt,
    createdAt,
    createdBy: "company-a-invite-admin",
    usedAt,
    usedBy: driverUid,
    revokedAt: null,
    revokedBy: null
  });

  await assertSucceeds(batch.commit());
});

test("29. inviteを消費しないregistrationRequest単独作成は拒否される", async () => {
  const driverUid = "company-a-invite-only-request-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inviteId = "invite-7b3e1a9c5d2f8e6a4c0b7d1f9e3a5c8b";
  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const createdAt = Timestamp.fromMillis(Date.now());

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `companies/${companyId}`), { name: "Company A" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}`), { name: "Main Office" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}/invites/${inviteId}`), {
      companyId,
      officeId,
      status: "active",
      expiresAt,
      createdAt,
      createdBy: "company-a-invite-admin",
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      revokedBy: null
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(setDoc(
    doc(
      driverDb,
      `companies/${companyId}/offices/${officeId}/registrationRequests/${driverUid}`
    ),
    {
      displayName: "Invite Only Driver",
      loginId: "invite-only-driver",
      role: "driver",
      companyId,
      officeId,
      status: "pending",
      createdAt: "2026-09-19T00:00:00.000Z",
      inviteId
    }
  ));
});

test("30. registrationRequestなしのinvite単独消費は拒否される", async () => {
  const driverUid = "company-a-invite-only-consume-driver";
  const companyId = "company-a";
  const officeId = "office-main";
  const inviteId = "invite-4e8a2c6f1b9d3a7e5c0f2b6d8a1e4c9b";
  const expiresAt = Timestamp.fromMillis(Date.now() + 60 * 60 * 1000);
  const createdAt = Timestamp.fromMillis(Date.now());
  const usedAt = Timestamp.fromMillis(Date.now());

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, `companies/${companyId}`), { name: "Company A" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}`), { name: "Main Office" });
    await setDoc(doc(db, `companies/${companyId}/offices/${officeId}/invites/${inviteId}`), {
      companyId,
      officeId,
      status: "active",
      expiresAt,
      createdAt,
      createdBy: "company-a-invite-admin",
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      revokedBy: null
    });
  });

  const driverDb = testEnv.authenticatedContext(driverUid).firestore();
  await assertFails(updateDoc(
    doc(driverDb, `companies/${companyId}/offices/${officeId}/invites/${inviteId}`),
    {
      companyId,
      officeId,
      status: "used",
      expiresAt,
      createdAt,
      createdBy: "company-a-invite-admin",
      usedAt,
      usedBy: driverUid,
      revokedAt: null,
      revokedBy: null
    }
  ));
});