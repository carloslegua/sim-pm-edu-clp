import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "comms",
  entry: "src/modules/comms/main.ts",
  fileName: "comms.js",
  globalName: "Comms"
}));
