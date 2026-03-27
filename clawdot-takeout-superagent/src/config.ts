export type TakeoutConfig = {
  gatewayUrl: string;
  apiKey: string;
  adminSecret: string;
  profilesDataDir: string;
  defaultLat?: number;
  defaultLng?: number;
  timeoutMs: number;
};

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => process.env[key] ?? "");
}

function toNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export function parseConfig(raw: unknown): TakeoutConfig {
  const cfg = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw : {}) as Record<string, unknown>;

  const gatewayUrl = resolveEnvVars(String(cfg.gatewayUrl ?? "http://127.0.0.1:3100"))
    .replace(/\/+$/, "");
  const timeoutMs = Math.max(1000, toNumber(cfg.timeoutMs, 30_000));

  return {
    gatewayUrl,
    apiKey: resolveEnvVars(String(cfg.apiKey ?? "")),
    adminSecret: resolveEnvVars(String(cfg.adminSecret ?? "")),
    profilesDataDir: resolveEnvVars(String(cfg.profilesDataDir ?? ""))
      .replace(/^~/, process.env.HOME ?? ""),
    defaultLat: typeof cfg.defaultLat === "number" ? cfg.defaultLat : undefined,
    defaultLng: typeof cfg.defaultLng === "number" ? cfg.defaultLng : undefined,
    timeoutMs,
  };
}

export const takeoutConfigSchema = {
  parse: parseConfig,
  uiHints: {
    gatewayUrl: { label: "Gateway URL", placeholder: "http://127.0.0.1:3100" },
    apiKey: { label: "Gateway API Key", sensitive: true, placeholder: "${XIADIAN_API_KEY}" },
    adminSecret: { label: "Admin Secret", sensitive: true, placeholder: "${ADMIN_SECRET}" },
    profilesDataDir: { label: "Profiles Directory", placeholder: "/path/to/identity/users" },
    defaultLat: { label: "Default Latitude" },
    defaultLng: { label: "Default Longitude" },
  },
};
