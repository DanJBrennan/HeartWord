import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL(".", import.meta.url));
const CONTROL_ROOM_PATH = "/work/agent-control-room.html";
const CONTROL_ROOM_ASSET_PREFIX = "/docs/assets/";
const CONTROL_ROOM_ASSET_ROOT = resolve(REPOSITORY_ROOT, "docs", "assets");
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".mp4": "video/mp4", ".json": "application/json"
};

function isSafeDescendant(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path !== "" && !path.startsWith("..") && !isAbsolute(path);
}

function controlRoomPresentationPlugin(): Plugin {
  return {
    name: "heartword-control-room-presentation",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
        let file: string | undefined;
        if (pathname === CONTROL_ROOM_PATH) {
          file = resolve(REPOSITORY_ROOT, "work", "agent-control-room.html");
        } else if (pathname.startsWith(CONTROL_ROOM_ASSET_PREFIX)) {
          try {
            const assetPath = decodeURIComponent(pathname.slice(CONTROL_ROOM_ASSET_PREFIX.length));
            const candidate = resolve(CONTROL_ROOM_ASSET_ROOT, assetPath);
            if (isSafeDescendant(CONTROL_ROOM_ASSET_ROOT, candidate)) file = candidate;
          } catch { return next(); }
        } else {
          return next();
        }
        if (!file || !existsSync(file) || !statSync(file).isFile()) return next();
        response.statusCode = 200;
        response.setHeader("Content-Type", CONTENT_TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
        createReadStream(file).on("error", next).pipe(response);
      });
    }
  };
}

// v1: single-user local tool. Vite serves the frontend in dev and proxies
// API calls to the Express backend (src/server); in production the backend
// serves the built static files from dist/web. See docs/ARCHITECTURE.md's
// "Application shape" and "Technology stack" sections.
export default defineConfig({
  root: "src/web",
  plugins: [react(), controlRoomPresentationPlugin()],
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
