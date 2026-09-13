import { defineConfig } from "vite";
import { moduleLibConfig } from "./lib.config.mjs";

export default defineConfig(moduleLibConfig({
  key: "schedule-plan",
  entry: "src/modules/schedule-plan/main.ts",
  fileName: "schedule-plan.js",
  globalName: "ScheduleManagementPlan"
}));
