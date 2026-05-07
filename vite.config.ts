import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

const root = path.resolve(__dirname, "vite-src");

export default defineConfig({
  root,
  plugins: [react(), viteSingleFile()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "next-intl": path.resolve(root, "src/shims/next-intl.tsx"),
      "next-themes": path.resolve(root, "src/shims/next-themes.tsx"),
      "next/link": path.resolve(root, "src/shims/next-link.tsx"),
      "next/dynamic": path.resolve(root, "src/shims/next-dynamic.ts"),
      "next/navigation": path.resolve(root, "src/shims/next-navigation.ts"),
    },
  },
  build: {
    outDir: path.resolve(__dirname, "dist-html"),
    emptyOutDir: true,
    target: "esnext",
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
