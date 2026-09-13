import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "cronograma-cpm",
  entry: "src/modules/cronograma-cpm/main.ts",
  fileName: "cronograma-cpm.js",
  globalName: "CronogramaCpm"
}));
