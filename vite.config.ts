import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// v1: single-user local tool. Vite serves the frontend in dev and proxies
// API calls to the Express backend (src/server); in production the backend
// serves the built static files from dist/web. See docs/ARCHITECTURE.md's
// "Application shape" and "Technology stack" sections.
export default defineConfig({
  root: "src/web",
  plugins: [react()],
  build: {
    outDir: "../../dist/web",
    emptyOutDir: true
  },
  server: {
    // Bind dual-stack so both localhost resolution paths (::1 and 127.0.0.1)
    // reach the Control Room. The presentation page itself uses 127.0.0.1
    // for its local API bridge.
    host: "::",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true
      },
      "/media": {
        target: "http://localhost:4000",
        changeOrigin: true
      }
    }
  }
});
