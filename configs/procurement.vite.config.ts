import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "procurement",
  entry: "src/modules/procurement/main.ts",
  fileName: "procurement.js",
  globalName: "Procurement"
}));
