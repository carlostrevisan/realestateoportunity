import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(path.dirname(new URL(import.meta.url).pathname), "./src") },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      // In dev mode, proxy /api calls to Express backend
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
  },
});
