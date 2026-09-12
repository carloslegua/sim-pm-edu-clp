import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "wbs",
  entry: "src/modules/wbs/main.ts",
  fileName: "wbs.js",
  globalName: "WbsBuilder"
}));
