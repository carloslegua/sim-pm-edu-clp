import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "project-charter",
  entry: "src/modules/project-charter/main.ts",
  fileName: "project-charter.js",
  globalName: "ProjectCharter"
}));
