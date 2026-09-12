import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "cost",
  entry: "src/modules/cost/main.ts",
  fileName: "cost.js",
  globalName: "CostManagement"
}));
