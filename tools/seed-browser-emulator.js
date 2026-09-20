const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { initializeTestEnvironment } = require("@firebase/rules-unit-testing");
const { doc, setDoc, Timestamp } = require("firebase/firestore");

const PROJECT_ID = "tramo-browser-test";
const AUTH_EMULATOR_HOST = "127.0.0.1:9099";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080";
const COMPANY_ID = "company-a";
const OFFICE_ID = "office-main";
const ADMIN_LOGIN_ID = "browser-admin";
const ADMIN_PASSWORD = "TramoBrowserAdmin-2026!";
const ADMIN_EMAIL = `${ADMIN_LOGIN_ID}.${OFFICE_ID}.${COMPANY_ID}@truck-inspection.invalid`;

function requireLocalEndpoint(name, value, expected) {
  if (value !== expected) {
    throw new Error(`${name} must be exactly ${expected}; refusing to write data`);
  }
}

async function readJson(response) {
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body)}`);
  }
  return body;
}

async function createAuthUser() {
  const signupResponse = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        returnSecureToken: true
      })
    }
  );
  if (signupResponse.ok) return readJson(signupResponse);

  const signupError = await signupResponse.text();
  if (!signupError.includes("EMAIL_EXISTS")) {
    throw new Error(`${signupResponse.status} ${signupResponse.statusText}: ${signupError}`);
  }

  const signInResponse = await fetch(
    `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-local`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        returnSecureToken: true
      })
    }
  );
  return readJson(signInResponse);
}

async function main() {
  requireLocalEndpoint("FIREBASE_AUTH_EMULATOR_HOST", process.env.FIREBASE_AUTH_EMULATOR_HOST, AUTH_EMULATOR_HOST);
  requireLocalEndpoint("FIRESTORE_EMULATOR_HOST", process.env.FIRESTORE_EMULATOR_HOST, FIRESTORE_EMULATOR_HOST);
  if (process.env.BROWSER_EMULATOR_PROJECT_ID && process.env.BROWSER_EMULATOR_PROJECT_ID !== PROJECT_ID) {
    throw new Error(`BROWSER_EMULATOR_PROJECT_ID must be ${PROJECT_ID}; refusing to write data`);
  }

  const now = new Date();
  const createdAt = Timestamp.fromDate(now);
  const expiresAtDate = new Date(now.getTime() + 60 * 60 * 1000);
  const expiresAt = Timestamp.fromDate(expiresAtDate);
  const inviteId = `browser-invite-${crypto.randomUUID().replaceAll("-", "")}`;

  const authUser = await createAuthUser();
  const adminUid = authUser.localId;
  if (!adminUid) throw new Error("Auth Emulator did not return localId");

  const testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8")
    }
  });
  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, `companies/${COMPANY_ID}`), {
        name: "TRAMO Browser Test Company"
      });
      await setDoc(doc(db, `companies/${COMPANY_ID}/offices/${OFFICE_ID}`), {
        name: "Main Office"
      });
      await setDoc(doc(db, `users/${adminUid}`), {
        role: "admin",
        companyId: COMPANY_ID,
        officeId: OFFICE_ID,
        displayName: "Browser Test Admin",
        loginId: ADMIN_LOGIN_ID
      });
      await setDoc(doc(db, `companies/${COMPANY_ID}/offices/${OFFICE_ID}/invites/${inviteId}`), {
        companyId: COMPANY_ID,
        officeId: OFFICE_ID,
        status: "active",
        expiresAt,
        createdAt,
        createdBy: adminUid,
        usedAt: null,
        usedBy: null,
        revokedAt: null,
        revokedBy: null
      });
    });
  } finally {
    await testEnv.cleanup();
  }

  const url = new URL("http://127.0.0.1:4173/test/index.html");
  url.searchParams.set("emulator", "1");
  url.searchParams.set("company", COMPANY_ID);
  url.searchParams.set("office", OFFICE_ID);
  url.searchParams.set("invite", inviteId);

  console.log(JSON.stringify({
    projectId: PROJECT_ID,
    authEmulator: `http://${AUTH_EMULATOR_HOST}`,
    firestoreEmulator: `http://${FIRESTORE_EMULATOR_HOST}`,
    adminUid,
    adminLoginId: ADMIN_LOGIN_ID,
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
    inviteId,
    inviteExpiresAt: expiresAtDate.toISOString(),
    browserUrl: url.toString()
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
