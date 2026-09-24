import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "quality",
  entry: "src/modules/quality/main.ts",
  fileName: "quality.js",
  globalName: "Quality"
}));
