import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "closeout",
  entry: "src/modules/closeout/main.ts",
  fileName: "closeout.js",
  globalName: "Closeout"
}));
