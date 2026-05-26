const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const feedDir = process.env.PANTHER_UPDATE_FEED_DIR
  ? path.resolve(process.env.PANTHER_UPDATE_FEED_DIR)
  : path.join(root, "release", "update-feed-local");
const port = Number(process.env.PANTHER_UPDATE_TEST_PORT || "17632");

function contentType(file) {
  if (file.endsWith(".json")) return "application/json";
  if (file.endsWith(".sig")) return "text/plain";
  if (file.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (file.endsWith(".msi")) return "application/octet-stream";
  return "application/octet-stream";
}

if (!fs.existsSync(path.join(feedDir, "latest.json"))) {
  console.error(`Missing ${path.join(feedDir, "latest.json")}`);
  console.error("Run: npm run update:local:manifest");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    });
    res.end();
    return;
  }
  const requested = decodeURIComponent(url.pathname.replace(/^\/+/, "") || "latest.json");
  const resolved = path.resolve(feedDir, requested);

  if (!resolved.startsWith(feedDir) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain", "Access-Control-Allow-Origin": "*" });
    res.end("not found");
    return;
  }

  res.writeHead(200, {
    "Content-Type": contentType(resolved),
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(resolved).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Serving Panther update feed: http://127.0.0.1:${port}/latest.json`);
  console.log(`Directory: ${feedDir}`);
});
