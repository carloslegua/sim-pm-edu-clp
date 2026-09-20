import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "changes",
  entry: "src/modules/changes/main.ts",
  fileName: "changes.js",
  globalName: "Changes"
}));
