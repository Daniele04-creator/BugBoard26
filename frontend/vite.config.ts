import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const proxyUrl = new URL(
  process.env.API_PROXY_TARGET?.trim() || "http://127.0.0.1:8080",
);
if (
  !["http:", "https:"].includes(proxyUrl.protocol) ||
  proxyUrl.username ||
  proxyUrl.password ||
  proxyUrl.search ||
  proxyUrl.hash ||
  proxyUrl.pathname !== "/"
)
  throw new Error(
    "API_PROXY_TARGET must be an HTTP(S) origin without credentials, path, query or fragment",
  );
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: { "/api": { target: proxyUrl.origin, changeOrigin: true } },
  },
});
