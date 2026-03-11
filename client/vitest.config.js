import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    // Alias leaflet to a manual mock to avoid canvas/DOM errors in happy-dom
    alias: {
      leaflet: new URL("./src/__mocks__/leaflet.js", import.meta.url).pathname,
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/test/**", "src/__mocks__/**", "src/main.jsx"],
    },
  },
});
