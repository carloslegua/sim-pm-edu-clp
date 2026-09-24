import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "pmplan",
  entry: "src/modules/pmplan/main.ts",
  fileName: "plan-direccion.js",
  globalName: "PmPlan"
}));
