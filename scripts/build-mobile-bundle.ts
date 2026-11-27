/**
 * Builds the self-contained offline web bundle embedded inside both native apps:
 * - Android: `mobile/android/app/src/main/assets/www/`
 *   Contains pre-rendered `/offline-app.html`, all referenced `/_next/static/*`
 *   chunks, `offline-catalog.json` (450 exercises + EN/ZH how-to + vocabularies),
 *   all 450 exercise thumbnails, all 36 body-heatmap PNGs, and `audio/rest_chime.wav`.
 *   Intercepted on the real `https://<FORTE_HOST>` origin by `MainActivity.java`.
 * - iOS: `mobile/ios/Forte/OfflineBundle/`
 *   Contains a single-file `offline-app.html` (CSS + JS chunks inlined, with
 *   `window.__FORTE_ASSET_BASE__ = "forte-asset://local"`) plus `offline-catalog.json`,
 *   thumbnails, body-heatmap PNGs, and `audio/rest_chime.wav` served by
 *   `BundledAssetSchemeHandler` while the document runs on `https://<FORTE_HOST>`.
 *
 * Usage:
 *   bun run scripts/build-mobile-bundle.ts [--skip-next-build]
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import net from "node:net";

const ROOT = process.cwd();
const OFFLINE_DIST = join(ROOT, "mobile", "offline-dist");
const SKIP_NEXT_BUILD = process.argv.includes("--skip-next-build");

function runCommand(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: ROOT,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} failed with exit code ${code}`));
    });
    child.on("error", reject);
  });
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      server.close(() => resolve(port));
    });
    server.on("error", reject);
  });
}

async function fetchOfflineAppHtml(): Promise<string> {
  const port = await findFreePort();
  const nextCli = join(ROOT, "node_modules", "next", "dist", "bin", "next");
  const server = spawn("node", [nextCli, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NODE_ENV: "production",
      // Ephemeral placeholders satisfy instrumentation.ts startup validation while
      // rendering zero-user-data `/offline-app` HTML (no DB or email calls occur).
      DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://build:build@127.0.0.1:5432/build",
      BETTER_AUTH_SECRET:
        process.env.BETTER_AUTH_SECRET ?? "build-time-offline-bundle-placeholder-secret-0123456789",
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? "https://forte-delta.vercel.app",
      EMAIL_API_KEY: process.env.EMAIL_API_KEY ?? "re_build_placeholder",
      EMAIL_FROM: process.env.EMAIL_FROM ?? "Forte <noreply@forte.local>",
    },
  });
  let stderr = "";
  server.stderr?.on("data", (chunk) => {
    stderr += String(chunk);
  });

  try {
    const url = `http://127.0.0.1:${port}/offline-app`;
    for (let attempt = 0; attempt < 60; attempt++) {
      try {
        const res = await fetch(url, { headers: { "Accept-Language": "en-US,en;q=0.9" } });
        if (res.ok) {
          return await res.text();
        }
      } catch {
        // Server still starting.
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Timed out waiting for local Next.js server to render /offline-app. ${stderr.slice(0, 400)}`);
  } finally {
    server.kill();
  }
}

function extractStaticPaths(html: string): string[] {
  const paths = new Set<string>();
  const regex = /\/_next\/static\/[^"'\s<>()\\,;]+/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    const clean = match[0].replace(/[.,;]+$/, "");
    const withoutQuery = clean.split("?")[0];
    if (/\.(?:js|css|woff2|woff|png|svg|ico|json)$/i.test(withoutQuery)) {
      paths.add(withoutQuery);
    }
  }
  return [...paths];
}

function inlineForIOS(html: string, staticPaths: string[]): string {
  const assetBaseScript =
    `<script>window.__FORTE_ASSET_BASE__="forte-asset://local";` +
    `(function(){var d=Document.prototype.createElement;Document.prototype.createElement=function(t,o){` +
    `var el=d.call(this,t,o);if(String(t).toLowerCase()==="script"){` +
    `var s=Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype,"src");` +
    `if(s&&s.set){Object.defineProperty(el,"src",{configurable:true,get:function(){return s.get.call(this);},` +
    `set:function(v){if(typeof v==="string"&&v.indexOf("/_next/static/")===0){v="forte-asset://local"+v;}s.set.call(this,v);}});}` +
    `}return el;};})();</script>`;
  let out = html.replace("<head>", `<head>${assetBaseScript}`);

  // Inline stylesheets so WKWebView loadHTMLString renders with zero network requests.
  for (const rel of staticPaths.filter((p) => p.endsWith(".css"))) {
    const disk = join(ROOT, ".next", rel.replace(/^\/_next\//, ""));
    if (!existsSync(disk)) continue;
    const css = readFileSync(disk, "utf8");
    const linkPattern = new RegExp(
      `<link[^>]+href="${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?[^"]*)?"[^>]*>`,
      "g",
    );
    out = out.replace(linkPattern, `<style>${css}</style>`);
  }

  // Inline script tags referenced directly in the HTML document.
  for (const rel of staticPaths.filter((p) => p.endsWith(".js"))) {
    const disk = join(ROOT, ".next", rel.replace(/^\/_next\//, ""));
    if (!existsSync(disk)) continue;
    const js = readFileSync(disk, "utf8").replace(/<\/script/gi, "<\\/script");
    const scriptPattern = new RegExp(
      `<script([^>]*)src="${rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\?[^"]*)?"([^>]*)><\\/script>`,
      "g",
    );
    out = out.replace(scriptPattern, `<script>${js}</script>`);
  }

  return out;
}

async function main() {
  // 1. Always regenerate public/offline-catalog.json from migrations so it can never drift.
  await runCommand("bun", ["run", "scripts/generate-offline-catalog.ts"]);

  // 2. Build production Next.js output unless explicitly skipped (e.g. already built).
  if (!SKIP_NEXT_BUILD) {
    await runCommand("bun", ["run", "build"]);
  }

  // 3. Render zero-user-data /offline-app HTML and collect all referenced /_next/static/* assets.
  const html = await fetchOfflineAppHtml();
  const staticPaths = extractStaticPaths(html);
  if (staticPaths.length === 0) {
    throw new Error("No /_next/static/* assets found in rendered /offline-app HTML.");
  }

  // 4. Populate mobile/offline-dist/ (Gradle and Xcode assemble this + public/ at native build time).
  rmSync(OFFLINE_DIST, { recursive: true, force: true });
  mkdirSync(join(OFFLINE_DIST, "android"), { recursive: true });
  mkdirSync(join(OFFLINE_DIST, "ios"), { recursive: true });
  writeFileSync(join(OFFLINE_DIST, "android", "offline-app.html"), html, "utf8");
  const iosHtml = inlineForIOS(html, staticPaths);
  writeFileSync(join(OFFLINE_DIST, "ios", "offline-app.html"), iosHtml, "utf8");

  // Copy every /_next/static/* file so both entry and dynamic lazy chunks resolve offline.
  cpSync(join(ROOT, ".next", "static"), join(OFFLINE_DIST, "_next", "static"), { recursive: true });

  // Verify every static path referenced by HTML exists in offline-dist.
  for (const rel of staticPaths) {
    const dest = join(OFFLINE_DIST, rel.replace(/^\/+/, ""));
    if (!existsSync(dest)) {
      const src = join(ROOT, ".next", rel.replace(/^\/_next\//, ""));
      if (existsSync(src)) {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest);
      } else {
        throw new Error(`Missing static asset referenced by /offline-app: ${rel}`);
      }
    }
  }

  console.log(
    `Built mobile/offline-dist (${staticPaths.length} referenced static chunks + Android/iOS HTML; native builds merge public/ catalog, 448 thumbnails, 36 body heatmaps, and audio).`,
  );
}

await main();
