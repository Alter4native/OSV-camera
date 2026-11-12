import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    __FRONTEND_ONLY__: JSON.stringify(process.env.VERCEL === "1"),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": "http://localhost:8000",
      "/ai": "http://localhost:8010",
    },
  },
});
