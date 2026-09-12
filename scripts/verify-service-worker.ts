import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Executes the production worker in a small service-worker-shaped runtime. The
 * assertions exercise observable cache behavior: which requests are intercepted,
 * what survives offline, and what an account transition deletes.
 */

const ORIGIN = "https://forte.example";
const WORKOUT_ID = "11111111-1111-4111-8111-111111111111";
const PRIVATE_WORKOUT_URL = `${ORIGIN}/workouts/${WORKOUT_ID}`;

type WorkerEvent = "install" | "activate" | "fetch" | "message";
type Listener = (event: unknown) => void;
const listeners = new Map<WorkerEvent, Listener>();

function keyOf(request: Request | string): string {
  return typeof request === "string" ? request : request.url;
}

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: Request | string): Promise<Response | undefined> {
    return this.entries.get(keyOf(request))?.clone();
  }

  async put(request: Request | string, response: Response): Promise<void> {
    this.entries.set(keyOf(request), response.clone());
  }
}

const stores = new Map<string, MemoryCache>();
const cacheStorage = {
  async open(name: string): Promise<MemoryCache> {
    const existing = stores.get(name);
    if (existing) return existing;
    const created = new MemoryCache();
    stores.set(name, created);
    return created;
  },
  async keys(): Promise<string[]> {
    return [...stores.keys()];
  },
  async delete(name: string): Promise<boolean> {
    return stores.delete(name);
  },
  async match(
    request: Request | string,
    options?: { cacheName?: string },
  ): Promise<Response | undefined> {
    if (options?.cacheName) return stores.get(options.cacheName)?.match(request);
    for (const cache of stores.values()) {
      const response = await cache.match(request);
      if (response) return response;
    }
    return undefined;
  },
};

function response(body: string, url: string): Response {
  const result = new Response(body, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  Object.defineProperty(result, "url", { value: url });
  const nativeClone = result.clone.bind(result);
  Object.defineProperty(result, "clone", {
    value: () => {
      const clone = nativeClone();
      Object.defineProperty(clone, "url", { value: url });
      return clone;
    },
  });
  return result;
}

let offline = false;
let deferredNetwork:
  | { promise: Promise<Response>; resolve: (value: Response) => void }
  | undefined;

async function networkFetch(input: Request | string): Promise<Response> {
  const url = keyOf(input);
  if (deferredNetwork) return deferredNetwork.promise;
  if (offline) throw new TypeError("offline");
  return response(`network:${new URL(url).pathname}`, url);
}

const self = {
  location: { origin: ORIGIN },
  clients: { claim: async () => undefined },
  skipWaiting: async () => undefined,
  addEventListener(type: WorkerEvent, listener: Listener) {
    listeners.set(type, listener);
  },
};

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "public", "sw.js"),
  "utf8",
);
runInNewContext(source, {
  self,
  caches: cacheStorage,
  fetch: networkFetch,
  Request,
  Response,
  Headers,
  URL,
  Promise,
  TypeError,
});

let failed = 0;
const output: string[] = [];
function check(name: string, condition: boolean, detail = ""): void {
  if (!condition) failed += 1;
  output.push(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? `  [${detail}]` : ""}`);
}

async function dispatchExtendable(type: "install" | "activate", data?: unknown): Promise<void> {
  const waits: Promise<unknown>[] = [];
  listeners.get(type)?.({ data, waitUntil: (work: Promise<unknown>) => waits.push(work) });
  await Promise.all(waits);
}

async function dispatchMessage(data: unknown): Promise<void> {
  const waits: Promise<unknown>[] = [];
  listeners.get("message")?.({ data, waitUntil: (work: Promise<unknown>) => waits.push(work) });
  await Promise.all(waits);
}

async function dispatchFetch(request: Request): Promise<{ intercepted: boolean; response?: Response }> {
  const waits: Promise<unknown>[] = [];
  let handled: Promise<Response> | undefined;
  listeners.get("fetch")?.({
    request,
    respondWith: (work: Promise<Response> | Response) => {
      handled = Promise.resolve(work);
    },
    waitUntil: (work: Promise<unknown>) => waits.push(work),
  });
  if (!handled) return { intercepted: false };
  const result = await handled;
  await Promise.all(waits);
  return { intercepted: true, response: result };
}

function request(url: string, mode: RequestMode = "cors", headers?: HeadersInit): Request {
  const result = new Request(url, { headers });
  Object.defineProperty(result, "mode", { value: mode });
  return result;
}

await cacheStorage.open("forte-v2");
await dispatchExtendable("install");
await dispatchExtendable("activate");
check("activation retires the old all-request cache", !stores.has("forte-v2"));
check(
  "activation creates separate static and private caches",
  stores.has("forte-static-v3") && stores.has("forte-private-v3"),
);

const accountUrl = `${ORIGIN}/account`;
const onlineAccount = await dispatchFetch(request(accountUrl, "navigate"));
check("an authenticated non-workout navigation still uses the network", await onlineAccount.response?.text() === "network:/account");
offline = true;
const offlineAccount = await dispatchFetch(request(accountUrl, "navigate"));
check(
  "an authenticated non-workout page is never restored from cache",
  (await offlineAccount.response?.text())?.includes("You are offline") === true,
);
offline = false;

const onlineWorkout = await dispatchFetch(request(PRIVATE_WORKOUT_URL, "navigate"));
check("a workout navigation is served online", await onlineWorkout.response?.text() === `network:/workouts/${WORKOUT_ID}`);
offline = true;
const unwarmedWorkout = await dispatchFetch(request(PRIVATE_WORKOUT_URL, "navigate"));
check(
  "a workout is not retained until its logger explicitly warms the route",
  (await unwarmedWorkout.response?.text())?.includes("You are offline") === true,
);
offline = false;

await dispatchMessage({ type: "cache-private-route", url: PRIVATE_WORKOUT_URL });
offline = true;
const offlineWorkout = await dispatchFetch(request(PRIVATE_WORKOUT_URL, "navigate"));
check(
  "the explicitly warmed workout route survives offline",
  await offlineWorkout.response?.text() === `network:/workouts/${WORKOUT_ID}`,
);
offline = false;

const rsc = await dispatchFetch(
  request(`${PRIVATE_WORKOUT_URL}?_rsc=abc`, "cors", { RSC: "1" }),
);
check("Next RSC GETs are not intercepted or cached", !rsc.intercepted);

const staticUrl = `${ORIGIN}/_next/static/chunks/app.js`;
await dispatchFetch(request(staticUrl));
offline = true;
const cachedStatic = await dispatchFetch(request(staticUrl));
check("an immutable build asset survives offline", await cachedStatic.response?.text() === "network:/_next/static/chunks/app.js");
offline = false;

await dispatchMessage({ type: "clear-private-cache" });
check("account cleanup deletes private caches", !stores.has("forte-private-v3"));
check("account cleanup preserves shared static assets", stores.has("forte-static-v3"));
offline = true;
const clearedWorkout = await dispatchFetch(request(PRIVATE_WORKOUT_URL, "navigate"));
check(
  "a cleared account cannot recover its workout snapshot",
  (await clearedWorkout.response?.text())?.includes("You are offline") === true,
);
offline = false;

await dispatchMessage({ type: "cache-private-route", url: PRIVATE_WORKOUT_URL });
offline = true;
const warmedWorkout = await dispatchFetch(request(PRIVATE_WORKOUT_URL, "navigate"));
check(
  "a client-side logger transition can warm its exact route",
  await warmedWorkout.response?.text() === `network:/workouts/${WORKOUT_ID}`,
);
offline = false;

let resolveDeferred!: (value: Response) => void;
deferredNetwork = {
  promise: new Promise<Response>((resolve) => {
    resolveDeferred = resolve;
  }),
  resolve: (value) => resolveDeferred(value),
};
const racingWarm = dispatchMessage({ type: "cache-private-route", url: PRIVATE_WORKOUT_URL });
await Promise.resolve();
await dispatchMessage({ type: "clear-private-cache" });
deferredNetwork.resolve(response("late private response", PRIVATE_WORKOUT_URL));
await racingWarm;
deferredNetwork = undefined;
check(
  "a response started before cleanup cannot recreate the private cache",
  !stores.has("forte-private-v3") || stores.get("forte-private-v3")?.entries.size === 0,
);

console.log(output.join("\n"));
if (failed > 0) {
  console.error(`\n${failed} service-worker verification check${failed === 1 ? "" : "s"} failed.`);
  process.exit(1);
}
console.log(`\n${output.length}/${output.length} service-worker checks passed.`);
