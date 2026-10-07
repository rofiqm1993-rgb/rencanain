import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
await mkdir("outputs", { recursive: true });
await build({ stdin: { contents: 'export * from "./lib/server-store.ts"; export * from "./lib/server-quota.ts"; export * from "./lib/server-projects.ts"; export * from "./lib/server-runtime.ts"; export * from "./lib/prd.ts"; export * from "./lib/clarification.ts"; export * from "./lib/tech-stack.ts"; export { POST as generate, GET as recover } from "./app/api/generate/route.ts"; export { GET as account } from "./app/api/account/route.ts"; export { POST as save, PATCH as task, DELETE as remove } from "./app/api/projects/route.ts";', resolveDir: process.cwd() }, bundle: true, platform: "node", format: "esm", outfile: "outputs/server-test-module.mjs", plugins: [{ name: "isolated-auth-env", setup(b) {
  b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
  // Identity verification has its own error tests. All datastore and quota operations here are real implementation code.
  b.onResolve({ filter: /server-auth$/ }, () => ({ path: "auth", namespace: "fixture" }));
  b.onResolve({ filter: /^@\// }, a => ({ path: resolve(a.path.replace("@/", "")) + ".ts" }));
  b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "env" ? 'export const env = globalThis.runtimeEnv;' : 'export async function verifyFirebaseToken(token) { if (!token.startsWith("fixture:")) throw new Error("invalid"); return token.slice(8); }', loader: "js" }));
} }] });
const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
const private_key = await exportPKCS8(privateKey);
globalThis.runtimeEnv = { FIREBASE_PROJECT_ID: "fixture", FIREBASE_API_KEY: "fixture", FIREBASE_AUTH_DOMAIN: "fixture", FIREBASE_STORAGE_BUCKET: "fixture", FIREBASE_MESSAGING_SENDER_ID: "fixture", FIREBASE_APP_ID: "fixture", DEEPSEEK_API_KEY: "fixture-ai-key", DEEPSEEK_MODEL: "fixture-model", FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ project_id: "fixture", client_email: "service@fixture.invalid", private_key }) };
const m = await import("../outputs/server-test-module.mjs");
const db = new Map(), versions = new Map(), sessions = new Map();
let oauthCalls = 0, aiCalls = 0, abortCommits = 0, failCommitResponse = false, provider = "valid", permissionDenied = false, repairCalls = 0, repairSignal;
const draft = { ...m.newDraft("Aplikasi stok toko kecil untuk mencatat barang masuk dan keluar."), answers: [["Pemilik toko"], ["Daftar barang"], ["Catat barang masuk"], ["Nyaman di ponsel"], ["Riwayat stok"]], completed: true, step: 4 };
const stack = m.recommendStack(draft).stack, raw = structuredClone(m.examplePRD(draft, stack));
raw.title = "Stok Toko Harian";
raw.phases.forEach(p => p.features.forEach(f => { f.description = `Catat ${f.title} dengan SKU dan jumlah barang toko.`; f.subfeatures.forEach(t => { t.title = "Validasi jumlah dan simpan transaksi stok per pemilik toko"; }); }));
const originalFetch = globalThis.fetch;
const basePath = "projects/fixture/databases/(default)/documents/";
globalThis.fetch = async (url, init = {}) => {
  const target = new URL(url), body = init.body ? JSON.parse(typeof init.body === "string" && !String(init.body).startsWith("grant_type") ? init.body : "null") : null;
  if (target.hostname === "oauth2.googleapis.com") {
    oauthCalls++;
    const form = new URLSearchParams(init.body), verified = await jwtVerify(form.get("assertion"), publicKey, { audience: "https://oauth2.googleapis.com/token", issuer: "service@fixture.invalid" });
    assert.equal(verified.payload.scope, "https://www.googleapis.com/auth/datastore");
    return Response.json({ access_token: "fixture-oauth", expires_in: 3600 });
  }
  if (target.hostname === "api.deepseek.com") {
    aiCalls++; assert.equal(init.headers.Authorization, "Bearer fixture-ai-key"); assert.equal(body.response_format.type, "json_object");
    if (provider === "repair") {
      repairCalls++;
      const quota = db.get("users/repair/quota/free-lifetime"); assert.equal(quota.used, 0); assert.equal(Object.keys(quota.reservations).length, 1);
      if (repairCalls === 1) { repairSignal = init.signal; return Response.json({ choices: [{ finish_reason: "stop", message: { content: "{broken JSON" } }] }); }
      assert.equal(init.signal, repairSignal, "Both attempts share one deadline"); assert.equal(body.temperature, 0.2);
    }
    if (provider === "network") throw new TypeError("private provider detail");
    if (provider === "invalid") return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ title: "Incomplete", summary: "Missing fields", phases: [] }) } }] });
    if (provider === "truncated") return Response.json({ choices: [{ finish_reason: "length", message: { content: JSON.stringify(raw) } }] });
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(raw) } }] });
  }
  assert.equal(target.hostname, "firestore.googleapis.com", "Tests must not contact external services");
  assert.equal(init.headers.Authorization, "Bearer fixture-oauth");
  assert(init.signal);
  if (permissionDenied) return Response.json({ error: { status: "PERMISSION_DENIED", message: "private server detail" } }, { status: 403 });
  if (target.pathname.endsWith(":beginTransaction")) {
    assert.deepEqual(body, { options: { readWrite: {} } });
    const transaction = Buffer.from(crypto.randomUUID()).toString("base64"); sessions.set(transaction, { reads: new Map() });
    return Response.json({ transaction });
  }
  if (target.pathname.endsWith(":rollback")) { sessions.delete(body.transaction); return Response.json({}); }
  if (target.pathname.endsWith(":commit")) {
    const tx = sessions.get(body.transaction); assert(tx);
    if (abortCommits > 0 || [...tx.reads].some(([path, v]) => (versions.get(path) || 0) !== v)) {
      if (abortCommits > 0) abortCommits--;
      return Response.json({ error: { status: "ABORTED" } }, { status: 409 });
    }
    for (const write of body.writes) {
      const name = write.update?.name || write.delete; assert(name.startsWith(basePath));
      const path = name.slice(basePath.length);
      if (write.delete) db.delete(path); else db.set(path, m.decodeFields(write.update.fields));
      versions.set(path, (versions.get(path) || 0) + 1);
    }
    sessions.delete(body.transaction);
    if (failCommitResponse && body.writes.some(w => w.update?.fields.status?.stringValue === "completed")) { failCommitResponse = false; throw new TypeError("Response lost after committed write"); }
    return Response.json({ commitTime: new Date().toISOString(), writeResults: [] });
  }
  const path = decodeURIComponent(target.pathname.split("/documents/")[1]);
  const tx = sessions.get(target.searchParams.get("transaction")); assert(tx, "Every read must include its transaction");
  tx.reads.set(path, versions.get(path) || 0);
  return db.has(path) ? Response.json({ fields: m.encodeFields(db.get(path)) }) : Response.json({ error: { status: "NOT_FOUND" } }, { status: 404 });
};
function request(route, uid, body, method = "POST", origin = "https://fixture.invalid") {
  return new Request(`https://fixture.invalid/api/${route}`, { method, headers: { Origin: origin, ...(uid ? { Authorization: `Bearer fixture:${uid}` } : {}), "Content-Type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
try {
  const publicConfig = m.publicConfig(); assert(publicConfig.quotaReady); assert(!JSON.stringify(publicConfig).includes(private_key)); assert(!("serviceAccount" in publicConfig)); assert(!JSON.stringify(publicConfig).includes("fixture-ai-key"));
  abortCommits = 2;
  const snapshot = await m.account(request("account", "api", undefined, "GET")); assert.equal(snapshot.status, 200); assert.equal((await snapshot.json()).remaining, 1); assert.equal(abortCommits, 0);
  const id = crypto.randomUUID(), input = { draft, stack, requestId: id };
  const response = await m.generate(request("generate", "api", input)); assert.equal(response.status, 200);
  const plan = await response.json(); assert.equal(plan.generationId, id); assert.equal(plan.source, "ai"); assert.equal(aiCalls, 1);
  const repeated = await m.generate(request("generate", "api", input)); assert.equal(repeated.status, 200); assert.deepEqual(await repeated.json(), plan); assert.equal(aiCalls, 1);
  assert.equal(db.get("users/api/quota/free-lifetime").used, 1);
  const over = await m.generate(request("generate", "api", { ...input, requestId: crypto.randomUUID() })); assert.equal(over.status, 429); assert.equal(aiCalls, 1);
  const saved = await m.save(request("projects", "api", plan)); assert.equal(saved.status, 200); const project = await saved.json();
  const savedAgain = await m.save(request("projects", "api", plan)); assert.equal((await savedAgain.json()).id, project.id);
  const updated = await m.task(request("projects", "api", { id: project.id, taskId: "p1-f1-t1", done: true }, "PATCH")); assert.equal(updated.status, 200); assert((await updated.json()).tasks["p1-f1-t1"]);
  assert.equal((await m.task(request("projects", "other", { id: project.id, taskId: "p1-f1-t1", done: true }, "PATCH"))).status, 404);
  assert.equal((await m.save(request("projects", null, plan))).status, 401);
  assert.equal((await m.save(request("projects", "api", plan, "POST", "https://attacker.invalid"))).status, 403);
  assert.equal((await m.task(request("projects", "api", { id: "../escape", taskId: "id", done: true }, "PATCH"))).status, 400);
  db.set("users/api/billing/account", { package: "pro", proStartedAt: new Date(Date.now() - 30 * 86400000).toISOString(), proExpiresAt: new Date(Date.now() - 1).toISOString() });
  assert.equal((await m.generate(request("generate", "api", { ...input, requestId: crypto.randomUUID() }))).status, 403);
  assert.equal((await m.task(request("projects", "api", { id: project.id, taskId: "p1-f1-t1", done: false }, "PATCH"))).status, 403);
  assert.equal((await m.remove(request("projects", "api", { id: project.id }, "DELETE"))).status, 403);
  assert.equal((await m.save(request("projects", "api", { ...plan, source: "example", generatedAt: new Date().toISOString() }))).status, 403);
  const oldResult = await m.recover(request(`generate?requestId=${id}`, "api", undefined, "GET")); assert.equal(oldResult.status, 200); assert.equal((await oldResult.json()).status, "completed");
  const otherResult = await m.recover(request(`generate?requestId=${id}`, "other", undefined, "GET")); assert.equal((await otherResult.json()).status, "missing");
  assert(db.has(`users/api/projects/${project.id}`), "Expired Pro cannot remove its prior projects");
  for (const [i, mode] of ["invalid", "truncated", "network"].entries()) {
    provider = mode; const uid = `failure-${i}`, jobId = crypto.randomUUID();
    const fail = await m.generate(request("generate", uid, { ...input, requestId: jobId })); assert(fail.status >= 500); assert(!(await fail.json()).error.includes("private"));
    const q = db.get(`users/${uid}/quota/free-lifetime`); assert.equal(q.used, 0); assert.deepEqual(q.reservations, {}); assert.equal(db.get(`users/${uid}/generations/${jobId}`).status, "failed");
  }
  provider = "repair";
  const repaired = await m.generate(request("generate", "repair", { ...input, requestId: crypto.randomUUID() })); assert.equal(repaired.status, 200); assert.equal(repairCalls, 2); assert.equal(db.get("users/repair/quota/free-lifetime").used, 1);
  provider = "valid"; failCommitResponse = true;
  const lostInput = { ...input, requestId: crypto.randomUUID() }, lost = await m.generate(request("generate", "lost", lostInput));
  assert.equal(lost.status, 503); const beforeRetry = aiCalls;
  assert.equal(db.get("users/lost/quota/free-lifetime").used, 1);
  assert.equal(db.get(`users/lost/generations/${lostInput.requestId}`).status, "completed");
  const recovered = await m.generate(request("generate", "lost", lostInput)); assert.equal(recovered.status, 200); assert.equal(aiCalls, beforeRetry); assert.equal(db.get("users/lost/quota/free-lifetime").used, 1);
  permissionDenied = true;
  const denied = await m.account(request("account", "api", undefined, "GET")); assert.equal(denied.status, 503); assert(!(await denied.json()).error.includes("private"));
  permissionDenied = false;
  assert.equal(oauthCalls, 1, "OAuth token reused until expiry");
  globalThis.runtimeEnv.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify({ project_id: "wrong-project", client_email: "service@fixture.invalid", private_key });
  await assert.rejects(m.createFirestoreStore().run(async () => {}), e => e.code === "storage-auth");
  delete globalThis.runtimeEnv.FIREBASE_SERVICE_ACCOUNT_JSON;
  assert.equal(m.publicConfig().aiReady, false, "AI blocked when permanent quota storage is missing");
  console.log("PASS: real REST adapter with signed OAuth assertion; transaction conflict retry; server generation/quota/save/task flow; failed AI leaves quota intact; lost commit response recovered without duplicate charge; authenticated ownership/origin/input guards; credentials remain private; missing config fails closed.");
} finally { globalThis.fetch = originalFetch; }
