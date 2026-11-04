import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const source = resolve(import.meta.dirname, "../..");
const target = process.argv[2];
if (!target) throw new Error("Provide a new isolated upload directory.");
const upload = resolve(target);
await mkdir(upload); // Fail rather than overwrite another deployment workspace.
const output = resolve(upload, ".vercel/output");
const staticDir = resolve(output, "static");
await cp(resolve(import.meta.dirname, "dist"), staticDir, { recursive: true });
await mkdir(resolve(staticDir, "brand/fonts"), { recursive: true });
for (const file of ["mark-light-bg.svg", "mark-violet.svg", "favicon-32.png"]) {
  await cp(resolve(source, "public/brand", file), resolve(staticDir, "brand", file));
}
for (const file of await readdir(resolve(source, "public/brand/fonts"))) {
  if (/\.(ttf|txt)$/.test(file))
    await cp(resolve(source, "public/brand/fonts", file), resolve(staticDir, "brand/fonts", file));
}
const html = await readFile(resolve(staticDir, "index.html"), "utf8");
const hashes = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)]
  .filter((m) => m[1].trim())
  .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
const csp = `default-src 'none'; script-src 'self' ${hashes.join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`;
await writeFile(
  resolve(output, "config.json"),
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "Content-Security-Policy": csp,
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex, nofollow",
            "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
          },
          continue: true,
        },
        { src: "/", status: 307, headers: { Location: "/landing-preview/a" } },
        { src: "/landing-preview/(a|b)/?", dest: "/index.html" },
        { handle: "filesystem" },
      ],
    },
    null,
    2,
  ),
);
await writeFile(resolve(upload, ".vercelignore"), "**/*\n");
console.log(
  JSON.stringify({
    upload,
    output,
    staticOnly: true,
    functions: 0,
    inlineScriptHashes: hashes.length,
  }),
);
