import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "knowledge",
  entry: "src/modules/knowledge/main.ts",
  fileName: "knowledge.js",
  globalName: "Knowledge"
}));
