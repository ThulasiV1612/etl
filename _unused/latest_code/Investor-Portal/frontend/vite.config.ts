import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig, loadEnv, type ProxyOptions } from "vite"
import react from "@vitejs/plugin-react"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * App is served from this path (must start and end with `/`, or `/` for domain root).
 * Set env `VITE_BASE_PATH` when the SPA lives under a subpath, e.g. `/portal/` so
 * hard refresh loads `/assets/*` from the correct URL (avoids HTML-as-JS MIME errors).
 */
function vitePublicBase(): string {
  const raw = process.env.VITE_BASE_PATH?.trim()
  if (!raw || raw === "/") return "/"
  const withLead = raw.startsWith("/") ? raw : `/${raw}`
  return withLead.endsWith("/") ? withLead : `${withLead}/`
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const repoRoot = path.resolve(__dirname, "..")
  const beEnv = loadEnv(mode, path.join(repoRoot, "backend"), "")
  const fromBackendFile = (beEnv.BACKEND_PORT ?? "").toString().trim()
  const fromProcess = (process.env.BACKEND_PORT ?? "").toString().trim()
  const backendPort = fromProcess || fromBackendFile || "5004"
  const feEnv = loadEnv(mode, __dirname, "")
  const proxyOverride = (
    process.env.VITE_DEV_API_PROXY ||
    (feEnv.VITE_DEV_API_PROXY as string) ||
    ""
  )
    .toString()
    .trim()
  const backendDevUrl = proxyOverride
    ? proxyOverride.replace(/\/$/, "")
    : `http://127.0.0.1:${backendPort}`

  const configureApiProxy: NonNullable<ProxyOptions["configure"]> = (proxy) => {
    /**
     * Some upstream servers reject proxied POSTs unless Content-Type / Content-Length are
     * re-applied with canonical casing (see vitejs/vite#17755). Express tolerates both;
     * re-sending is harmless and avoids spurious 403/empty-body failures behind strict proxies.
     */
    proxy.on("proxyReq", (proxyReq, req) => {
      const ct = req.headers["content-type"]
      if (typeof ct === "string" && ct.trim()) proxyReq.setHeader("Content-Type", ct)
      const cl = req.headers["content-length"]
      if (typeof cl === "string" && cl.trim()) proxyReq.setHeader("Content-Length", cl)
    })
    proxy.on("error", (err, _req, res) => {
      console.error(
        "\n[vite] /api|/uploads proxy error — target:",
        backendDevUrl,
        "\n  Reason:",
        err,
        "\n  Start the API (e.g. npm run dev in backend) and match BACKEND_PORT, or set VITE_DEV_API_PROXY in frontend .env\n",
      )
      if (res && "writeHead" in res && !res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" })
        res.end(
          "Bad Gateway: Vite could not connect to the API. Start the backend (e.g. npm run dev in the backend folder) so the proxy to " +
            backendDevUrl +
            " works. If the API uses another port/host, set VITE_DEV_API_PROXY in the frontend .env. See the Vite terminal for details.",
        )
      }
    })
  }

  return {
    base: vitePublicBase(),
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    server: {
      /**
       * Listen on 0.0.0.0 so both `http://127.0.0.1:5174` and `http://localhost:5174` work.
       * Default Vite on Windows often binds only `[::1]`, which breaks IPv4 clients and the API proxy UX.
       */
      host: true,
      port: 5174,
      strictPort: true,
      /**
       * Forward `/api` and `/uploads` to the same Express process. Port is read from
       * `../backend/.env` / `.env.local` (`loadEnv` → `BACKEND_PORT`) with shell override first
       * so the proxy matches `npm run dev` in the backend.
       *
       * Leave `VITE_BASE_URL` empty in `.env.local` so the app uses same-origin `/api/v1` and this
       * proxy runs (no cross-origin, no CORS). If you set `VITE_BASE_URL=http://localhost:5004`,
       * the browser calls the API directly from `:5174` → `:5004`; when the API is down or blocked,
       * DevTools reports “CORS request did not succeed” with status (null) even though the root cause
       * is often connection failure, not missing CORS headers.
       *
       * `VITE_DEV_API_PROXY` (full URL, e.g. `http://127.0.0.1:5004`) overrides the proxy target
       * when the backend is not on `BACKEND_PORT` from `../backend` env or you need a different host.
       */
      proxy: {
        "/api": {
          target: backendDevUrl,
          changeOrigin: true,
          configure: configureApiProxy,
        },
        "/uploads": {
          target: backendDevUrl,
          changeOrigin: true,
          configure: configureApiProxy,
        },
      },
    },
  }
})
