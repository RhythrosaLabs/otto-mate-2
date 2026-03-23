#!/usr/bin/env node
/**
 * Proxy for code-server that adds Cross-Origin-Resource-Policy headers.
 * Required when the parent page has COEP: credentialless (for other iframes).
 *
 * Proxies HTTP + WebSocket from port 3100 → code-server on port 3101.
 */
import http from "http";
import { spawn } from "child_process";

const EXTERNAL_PORT = 3100;
const INTERNAL_PORT = 3101;
const HOST = "127.0.0.1";

// Start code-server on internal port
const cs = spawn("code-server", [
  "--port", String(INTERNAL_PORT),
  "--auth", "none",
  "--disable-telemetry",
  "--bind-addr", `${HOST}:${INTERNAL_PORT}`,
], { stdio: "inherit" });

cs.on("error", (err) => {
  console.error("Failed to start code-server:", err.message);
  process.exit(1);
});

// Wait a moment for code-server to bind, then start proxy
setTimeout(() => {
  const server = http.createServer((req, res) => {
    const proxyReq = http.request(
      { hostname: HOST, port: INTERNAL_PORT, path: req.url, method: req.method, headers: req.headers },
      (proxyRes) => {
        const headers = { ...proxyRes.headers };
        headers["cross-origin-resource-policy"] = "cross-origin";

        // Strip headers that prevent iframe embedding.
        // code-server sets X-Frame-Options: SAMEORIGIN which blocks our iframe.
        delete headers["x-frame-options"];

        // Strip frame-ancestors from CSP if present (newer code-server versions)
        if (headers["content-security-policy"]) {
          headers["content-security-policy"] = headers["content-security-policy"]
            .split(";")
            .filter((d) => !d.trim().toLowerCase().startsWith("frame-ancestors"))
            .join(";");
        }

        res.writeHead(proxyRes.statusCode, headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", (err) => {
      res.writeHead(502);
      res.end("Proxy error: " + err.message);
    });
    req.pipe(proxyReq);
  });

  // WebSocket upgrade passthrough
  server.on("upgrade", (req, socket, head) => {
    const proxyReq = http.request({
      hostname: HOST,
      port: INTERNAL_PORT,
      path: req.url,
      method: req.method,
      headers: req.headers,
    });
    proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
      socket.write(
        `HTTP/1.1 101 ${proxyRes.statusMessage}\r\n` +
        Object.entries(proxyRes.headers).map(([k, v]) => `${k}: ${v}`).join("\r\n") +
        "\r\n\r\n"
      );
      if (proxyHead.length) socket.write(proxyHead);
      proxySocket.pipe(socket);
      socket.pipe(proxySocket);
    });
    proxyReq.on("error", () => socket.destroy());
    proxyReq.end();
  });

  server.listen(EXTERNAL_PORT, HOST, () => {
    console.log(`code-server proxy: http://${HOST}:${EXTERNAL_PORT} → :${INTERNAL_PORT}`);
  });
}, 2000);

// Cleanup
process.on("SIGTERM", () => { cs.kill(); process.exit(0); });
process.on("SIGINT", () => { cs.kill(); process.exit(0); });
