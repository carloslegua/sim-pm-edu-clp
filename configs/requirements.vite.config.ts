import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "requirements",
  entry: "src/modules/requirements/main.ts",
  fileName: "requirements.js",
  globalName: "Requirements"
}));
