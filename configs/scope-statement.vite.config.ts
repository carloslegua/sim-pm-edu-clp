import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "scope-statement",
  entry: "src/modules/scope-statement/main.ts",
  fileName: "scope-statement.js",
  globalName: "ScopeStatement"
}));
