import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "scope-validation",
  entry: "src/modules/scope-validation/main.ts",
  fileName: "scope-validation.js",
  globalName: "ScopeValidation"
}));
