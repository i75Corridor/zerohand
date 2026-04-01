import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
