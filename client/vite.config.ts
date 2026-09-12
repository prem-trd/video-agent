import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// AI Video Studio - client build config.
// The dev server proxies /api and /ws to the Node backend so the
// browser never needs a cross-origin request or the LLM API key.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:4000",
        ws: true,
      },
    },
  },
});
