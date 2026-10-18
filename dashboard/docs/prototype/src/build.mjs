// Rebuilds docs/prototype/v3-overview.html: bundles the repo's real engine
// (entry.ts → lib/) for the browser and inlines it into template.html.
// Run from the repo root:  node docs/prototype/src/build.mjs
// Node-only imports get tiny shims: node:crypto (AI-summary cache keys) and xlsx (file reading).
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const shims = {
  name: "shims",
  setup(b) {
    b.onResolve({ filter: /^(node:crypto|xlsx|server-only)$/ }, (args) => ({ path: args.path, namespace: "shim" }));
    b.onLoad({ filter: /.*/, namespace: "shim" }, (args) => ({
      contents:
        args.path === "node:crypto"
          ? "export function createHash(){ let s=''; return { update(x){ s+=x; return this; }, digest(){ let h=0; for (const c of s) h=(h*31+c.charCodeAt(0))|0; return String(h); } }; }"
          : args.path === "xlsx"
            ? "export const read=()=>{throw new Error('not in browser')}; export const utils={}; export default {};"
            : "export {};",
      loader: "js",
    }));
  },
};
const out = await build({ entryPoints: [path.join(here, "entry.ts")], bundle: true, format: "iife", globalName: "AdMateEngine", platform: "browser", target: "es2020", minify: true, write: false, plugins: [shims], logLevel: "warning" });
const engine = out.outputFiles[0].text.replace(/<\/script/g, "<\\/script");
const html = readFileSync(path.join(here, "template.html"), "utf8").replace("/*ENGINE*/", () => engine);
writeFileSync(path.join(here, "..", "v3-overview.html"), html);
console.log("wrote docs/prototype/v3-overview.html");
