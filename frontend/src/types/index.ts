export interface Config {
  username: string;
  repo: string;
  branch: string;
  token: string;
  enableCompression: boolean;
  tinifyKey: string;
}

export const ProcessingModeEnum = {
  GITHUB: "github",
  LOCAL: "local",
} as const;

export type ProcessingMode =
  (typeof ProcessingModeEnum)[keyof typeof ProcessingModeEnum];

export const ConfigStatusEnum = {
  UNKNOWN: "unknown",
  OK: "ok",
  ERROR: "error",
} as const;

export type ConfigStatus =
  (typeof ConfigStatusEnum)[keyof typeof ConfigStatusEnum];

export const defaultConfigValues: Config = {
  username: "",
  repo: "image-host",
  branch: "main",
  token: "",
  enableCompression: false,
  tinifyKey: "",
};
