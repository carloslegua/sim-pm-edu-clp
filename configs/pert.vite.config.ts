import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "pert",
  entry: "src/modules/pert/main.ts",
  fileName: "pert.js",
  globalName: "PertAnalysis"
}));
