// Local server with zero dependencies: `node server.js`, then open http://localhost:3000
// It serves /public and runs the same /api handlers that Vercel runs in production.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(root, "public");
const port = Number(process.env.PORT) || 3000;
const routes = new Set(["tokens", "quote", "status", "submit"]);
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);
    const apiMatch = url.pathname.match(/^\/api\/([a-z]+)$/);
    if (apiMatch && routes.has(apiMatch[1])) {
      try {
        const mod = await import(`./api/${apiMatch[1]}.js`);
        return await mod.default(req, res);
      } catch (err) {
        console.error(err);
        res.statusCode = 500;
        return res.end(JSON.stringify({ error: "Server error" }));
      }
    }

    // Clean URLs like Vercel: /pay -> /pay.html, / -> /index.html
    let path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (!extname(path)) path += ".html";
    const file = normalize(join(publicDir, path));
    if (!file.startsWith(publicDir)) {
      res.statusCode = 403;
      return res.end("Forbidden");
    }
    try {
      const body = await readFile(file);
      res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("Not found");
    }
  })
  .listen(port, () => console.log(`Pay Me in Anything running at http://localhost:${port}`));
