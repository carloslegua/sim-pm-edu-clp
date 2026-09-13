import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "stakeholder-studio",
  entry: "src/modules/stakeholder-studio/main.ts",
  fileName: "stakeholder-studio.js",
  globalName: "StakeholderStudio"
}));
