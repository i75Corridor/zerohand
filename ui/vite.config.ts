import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react-dom")) return "react-vendor";
          if (id.includes("node_modules/react/")) return "react-vendor";
          if (id.includes("node_modules/react-router")) return "router";
          if (id.includes("node_modules/@tanstack/react-query")) return "query";
          if (id.includes("node_modules/recharts") || id.includes("node_modules/d3-")) return "recharts";
          if (id.includes("node_modules/@xyflow")) return "xyflow";
          if (id.includes("node_modules/react-markdown") || id.includes("node_modules/remark-") || id.includes("node_modules/rehype-") || id.includes("node_modules/mdast-") || id.includes("node_modules/micromark") || id.includes("node_modules/unified") || id.includes("node_modules/unist-")) return "markdown";
        },
      },
    },
  },
  server: {
    port: 3008,
    proxy: {
      "/api": "http://localhost:3009",
      "/ws": {
        target: "ws://localhost:3009",
        ws: true,
      },
    },
  },
});
