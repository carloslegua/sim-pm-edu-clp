import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "obs",
  entry: "src/modules/obs/main.ts",
  fileName: "obs.js",
  globalName: "ObsBuilder"
}));
