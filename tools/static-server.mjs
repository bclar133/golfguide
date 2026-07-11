import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const root = process.cwd();
const port = Number(process.argv[2] || 4174);
const host = "127.0.0.1";

const types = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url || "/", `http://${host}:${port}`);
  const pathname = decodeURIComponent(url.pathname);
  const target = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));

  if (!target.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(target, (error, data) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": types[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store"
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Aussie Golf Guide server running at http://${host}:${port}/`);
});
