import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "risks",
  entry: "src/modules/risks/main.ts",
  fileName: "risks.js",
  globalName: "Risks"
}));
