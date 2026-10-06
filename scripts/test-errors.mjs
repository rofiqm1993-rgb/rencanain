import { build } from "esbuild";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
await mkdir("outputs", { recursive: true });
await build({
  stdin: { contents: 'export * from "./lib/user-errors.ts"; export * from "./lib/client-request.ts"; export * from "./lib/project-repository.ts"; export * from "./lib/prd.ts"; export * from "./lib/clarification.ts"; export * from "./lib/tech-stack.ts"; export { POST } from "./app/api/generate/route.ts";', resolveDir: process.cwd() },
  bundle: true, platform: "node", format: "esm", outfile: "outputs/errors-test-module.mjs", define: { "import.meta.env.DEV": "true" },
  plugins: [{ name: "isolated-services", setup(b) {
    b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: "env", namespace: "fixture" }));
    b.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: "firestore", namespace: "fixture" }));
    b.onResolve({ filter: /firebase-client$/ }, () => ({ path: "client", namespace: "fixture" }));
    b.onResolve({ filter: /^@\// }, a => ({ path: resolve(process.cwd(), a.path.replace("@/", "")) + ".ts" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "env" ? 'export const env = { DEEPSEEK_API_KEY:"fixture-key-never-used-external", DEEPSEEK_MODEL:"fixture-model", FIREBASE_API_KEY:"fixture", FIREBASE_AUTH_DOMAIN:"fixture.invalid", FIREBASE_PROJECT_ID:"fixture", FIREBASE_STORAGE_BUCKET:"fixture", FIREBASE_MESSAGING_SENDER_ID:"fixture", FIREBASE_APP_ID:"fixture" };' : a.path === "client" ? 'export const firebaseDB = () => ({});' : 'export const collection=(...args)=>args; export const doc=(...args)=>args; export const getDocsFromServer=(...args)=>globalThis.sdkFixture.read(...args); export const setDoc=(...args)=>globalThis.sdkFixture.save(...args); export const updateDoc=(...args)=>globalThis.sdkFixture.update(...args); export const deleteDoc=(...args)=>globalThis.sdkFixture.remove(...args); export const deleteField=()=>"DELETE";', loader: "js" }));
  } }],
});
const moduleURL = new URL("../outputs/errors-test-module.mjs", import.meta.url);
const m = await import(moduleURL);
const originalFetch = globalThis.fetch, navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const storage = new Map();
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
Object.defineProperty(globalThis, "navigator", { configurable: true, value: { onLine: true } });
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const pause = ms => new Promise(ok => setTimeout(ok, ms));
const draft = { ...m.newDraft("Aplikasi stok untuk mencatat barang masuk dan keluar pada toko kecil."), step: 4, completed: true };
const plan = { prd: m.examplePRD(draft), source: "example", normalized: [], draft, stack: m.recommendStack(draft).stack, generatedAt: new Date().toISOString() };
try {
  // Client failures must never display raw provider errors or replace an existing plan.
  globalThis.fetch = async () => { throw new TypeError("PRIVATE-PROVIDER-TEXT"); };
  await assert.rejects(m.requestJSON("/api/generate"), e => e.code === "network" && !e.message.includes("PRIVATE"));
  globalThis.fetch = async () => new Response("<html>PRIVATE-PROVIDER-TEXT</html>", { status: 503 });
  await assert.rejects(m.requestJSON("/api/generate"), e => e.code === "invalid-response" && !e.message.includes("PRIVATE"));
  globalThis.fetch = async () => Response.json({ error: "Penyusunan terlalu lama. Coba lagi; draft tetap tersedia." }, { status: 504 });
  await assert.rejects(m.requestJSON("/api/generate"), e => e.code === "http-504" && e.message.includes("draft"));
  globalThis.fetch = (_, init) => new Promise((_, no) => init.signal.addEventListener("abort", () => no(new DOMException("aborted", "AbortError")), { once: true }));
  await assert.rejects(m.requestJSON("/api/generate", {}, 10), e => e.code === "request-timeout");
  const cancel = new AbortController(); const cancelled = m.requestJSON("/api/generate", { signal: cancel.signal }); cancel.abort();
  await assert.rejects(cancelled, e => e.code === "cancelled");
  const tokenRead = deferred(), tokenCancel = new AbortController();
  const pendingToken = m.readWithTimeout(tokenRead.promise, 100, "Sesi belum tersedia", tokenCancel.signal); tokenCancel.abort();
  await assert.rejects(pendingToken, e => e.code === "cancelled"); tokenRead.reject(new Error("late rejection handled"));
  assert(m.userError({ code: "permission-denied" }, "save").includes("akun"));
  assert(m.userError({ code: "unavailable" }, "load").includes("Coba lagi"));
  assert(m.userError({ code: "auth/popup-blocked" }, "login").includes("popup"));
  assert(m.userError(new DOMException("private", "QuotaExceededError"), "save").includes("Ekspor"));
  assert(!m.userError(new Error("PRIVATE-PROVIDER-TEXT"), "save").includes("PRIVATE"));
  let cloudCalls = 0; globalThis.sdkFixture = { read: async () => { cloudCalls++; return { docs: [] }; }, save: async () => { cloudCalls++; }, update: async () => { cloudCalls++; }, remove: async () => {} };
  navigator.onLine = false;
  await assert.rejects(m.projectRepository.list("account"), e => e.code === "offline");
  await assert.rejects(m.projectRepository.save(plan, "account"), e => e.code === "offline");
  assert.equal(cloudCalls, 0); navigator.onLine = true;
  // A slow write is still pending, never reported as failed/successful until backend acknowledgment.
  const write = deferred(); let notice = false, acknowledged = false;
  globalThis.sdkFixture.save = () => { cloudCalls++; return write.promise; };
  const saveA = m.projectRepository.save(plan, "account"), saveB = m.projectRepository.save(plan, "account");
  const waiting = m.withPendingNotice(saveA, () => { notice = true; }, 10).then(p => { acknowledged = true; return p; });
  await pause(25); assert(notice); assert.equal(acknowledged, false); assert.equal(cloudCalls, 1);
  write.resolve(); const projectA = await waiting, projectB = await saveB;
  assert.equal(projectA.id, projectB.id); assert(acknowledged);
  globalThis.sdkFixture.update = async () => { throw { code: "permission-denied" }; };
  await assert.rejects(m.projectRepository.setTask(projectA, "p1-f1-t1", true, "account"));
  assert.deepEqual(projectA.tasks, {});
  const slowRead = deferred(); const read = m.readWithTimeout(slowRead.promise, 10);
  await assert.rejects(read, e => e.code === "read-timeout"); slowRead.reject(new Error("late rejection handled"));
  globalThis.sdkFixture.read = async () => ({ docs: [{ id: "bad", data: () => ({ prd: {} }) }] });
  await assert.rejects(m.projectRepository.list("account"), e => e.code === "project-data");
  storage.set("aipp-projects", "{broken");
  await assert.rejects(m.projectRepository.list(null), e => e.code === "local-data");
  assert.equal(storage.get("aipp-projects"), "{broken");
  // All API calls use isolated, mocked upstreams: no credits, credentials, or real writes.
  const scenarios = [
    { name: "timeout", status: 504, upstream: async () => { throw new DOMException("private", "TimeoutError"); } },
    { name: "network", status: 503, upstream: async () => { throw new TypeError("PRIVATE"); } },
    { name: "quota", status: 502, upstream: async () => new Response("PRIVATE", { status: 402 }) },
    { name: "provider-limit", status: 502, upstream: async () => new Response("PRIVATE", { status: 429 }) },
    { name: "bad-json", status: 502, upstream: async () => new Response("PRIVATE", { status: 200 }) },
    { name: "empty", status: 502, upstream: async () => Response.json({ choices: [] }) },
    { name: "null", status: 502, upstream: async () => Response.json(null) },
    { name: "null-content", status: 502, upstream: async () => Response.json({ choices: [{ message: { content: "null" } }] }) },
  ];
  for (const [i, scenario] of scenarios.entries()) {
    const api = await import(`${moduleURL.href}?case=${i}`); globalThis.fetch = scenario.upstream;
    const response = await api.POST(new Request("http://localhost:4174/api/generate", { method: "POST", headers: { Origin: "http://localhost:4174", "Content-Type": "application/json" }, body: JSON.stringify({ draft, stack: plan.stack }) }));
    assert.equal(response.status, scenario.status, scenario.name);
    const body = await response.json(); assert.equal(typeof body.error, "string"); assert(!body.error.includes("PRIVATE")); assert(!("prd" in body));
  }
  const authApi = await import(`${moduleURL.href}?auth=certificate-outage`);
  globalThis.fetch = async () => new Response("PRIVATE", { status: 503 });
  const fakeHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture-key" })).toString("base64url");
  const authResponse = await authApi.POST(new Request("http://localhost:4174/api/generate", { method: "POST", headers: { Origin: "http://localhost:4174", Authorization: `Bearer ${fakeHeader}.e30.fixture` }, body: "{}" }));
  assert.equal(authResponse.status, 503); assert((await authResponse.json()).error.includes("sesi"));
  console.log("PASS: API timeout/network/quota/invalid JSON; cancellation; safe auth/storage messages; offline guards; pending write acknowledgment and duplicate-save prevention; read retry timeout; failed task preserves prior state; corrupted data retained.");
} finally {
  globalThis.fetch = originalFetch;
  if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
  else delete globalThis.navigator;
}
