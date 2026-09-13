import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "panel-control",
  entry: "src/modules/panel-control/main.ts",
  fileName: "panel-control.js",
  globalName: "PanelControl"
}));
