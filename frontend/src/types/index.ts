export interface Config {
  username: string;
  repo: string;
  branch: string;
  token: string;
  enableCompression: boolean;
  tinifyKey: string;
}

export type ProcessingMode = "github" | "local";
export type ConfigStatus = "unknown" | "ok" | "error";

export const defaultConfigValues: Config = {
  username: "",
  repo: "image-host",
  branch: "main",
  token: "",
  enableCompression: false,
  tinifyKey: "",
};
