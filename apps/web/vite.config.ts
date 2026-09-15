import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";

const runtimeRegistryPath = path.resolve(__dirname, "../../config/third-party/autobase.yaml");
const devApiProxyTarget = process.env.VITE_DEV_API_PROXY_TARGET || "http://localhost:6789";

function runtimeRegistryPlugin(): Plugin {
  return {
    name: "dbdesk-runtime-registry",
    configureServer(server) {
      server.middlewares.use("/autobase.yaml", (_request, response) => {
        response.setHeader("Content-Type", "text/yaml; charset=utf-8");
        response.end(fs.readFileSync(runtimeRegistryPath, "utf8"));
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "autobase.yaml",
        source: fs.readFileSync(runtimeRegistryPath, "utf8")
      });
    }
  };
}

export default defineConfig({
  plugins: [runtimeRegistryPlugin(), tailwindcss(), tanstackRouter({}), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@common": path.resolve(__dirname, "../../packages/common"),
    },
  },
  server: {
    // Accept requests from outside a development container as well as localhost.
    host: "0.0.0.0",
    port: process.env.FRONTEND_PORT ? parseInt(process.env.FRONTEND_PORT) : 3001,
    // Keep `/api` same-origin in the browser while forwarding it to Express.
    // Without this, Vite's SPA fallback returns index.html for API requests.
    proxy: {
      "/api": {
        target: devApiProxyTarget,
        changeOrigin: true,
      },
    },
  },
});
