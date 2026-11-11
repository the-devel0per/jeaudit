/// <reference types="vitest" />
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_URL || "https://mp2cr432e6kaqq3g5w4mh4ziau0ipgxp.lambda-url.ap-southeast-2.on.aws";

  return {
    plugins: [react()],
    server: {
      proxy: {
        "/runs": { target, changeOrigin: true, secure: true },
        "/flags": { target, changeOrigin: true, secure: true },
        "/evaluation": { target, changeOrigin: true, secure: true },
        "/health": { target, changeOrigin: true, secure: true },
      },
    },
    test: { environment: "jsdom", setupFiles: "./src/setupTests.ts", globals: true },
  };
});
