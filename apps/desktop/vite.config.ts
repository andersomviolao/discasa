import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const desktopRoot = fileURLToPath(new URL(".", import.meta.url));
const sharedSource = fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url));

export default defineConfig({
  root: desktopRoot,
  plugins: [react()],
  resolve: {
    alias: {
      "@discasa/shared": sharedSource,
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
