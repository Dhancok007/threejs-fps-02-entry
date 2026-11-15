// Tiny static server for local play-testing: node serve.ts [--port 8080]
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "game");
const argPort = Number(process.argv[process.argv.indexOf("--port") + 1]);
const port = Number.isFinite(argPort) && argPort > 0 ? argPort : 8080;

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  let path = normalize(decodeURIComponent(url.pathname));
  if (path === "/" || path === "\\") path = "/index.html";
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("not found");
    return;
  }
  const ext = file.slice(file.lastIndexOf("."));
  res.writeHead(200, {
    "content-type": MIME[ext] ?? "application/octet-stream",
    "cache-control": "no-store",
  });
  res.end(readFileSync(file));
}).listen(port, "127.0.0.1", () => {
  console.log(`serving game/ at http://127.0.0.1:${port}/`);
});
