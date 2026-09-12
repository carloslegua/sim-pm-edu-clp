import type { UserConfig } from "vite";

export interface ModuleLibConfigOptions {
  key: string;
  entry: string;
  fileName: string;
  globalName?: string;
}

export function moduleLibConfig(options: ModuleLibConfigOptions): UserConfig;
