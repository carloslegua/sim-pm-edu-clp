import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "evm",
  entry: "src/modules/evm/main.ts",
  fileName: "evm.js",
  globalName: "Evm"
}));
