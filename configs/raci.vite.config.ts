import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "raci",
  entry: "src/modules/raci/main.ts",
  fileName: "raci.js",
  globalName: "RaciMatrix"
}));
