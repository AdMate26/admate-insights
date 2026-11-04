import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: import.meta.dirname,
  // Do not load the repository's .env files or expose its VITE_* variables.
  envDir: false,
  envPrefix: "ADMATE_DESIGN_PREVIEW_PUBLIC_",
  publicDir: false,
  resolve: { alias: { "@": resolve(import.meta.dirname, "../../src") } },
  plugins: [
    {
      name: "design-preview-import-boundary",
      generateBundle() {
        for (const id of this.getModuleIds()) {
          if (
            /@supabase|@tanstack\/react-start|src\/integrations\/|src\/lib\/(admate\.functions|ai\/|telegram\/|meta)|src\/(start|server)\./.test(
              id,
            )
          ) {
            this.error("A live backend module entered the design-preview bundle.");
          }
        }
      },
    },
    react(),
  ],
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
});
