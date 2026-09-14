import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "cost-estimate",
  entry: "src/modules/cost-estimate/main.ts",
  fileName: "cost-estimate.js",
  globalName: "CostEstimate"
}));
