import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "activities",
  entry: "src/modules/activities/main.ts",
  fileName: "activities.js",
  globalName: "ActivityDefinition"
}));
