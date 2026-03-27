import { readFile } from "node:fs/promises";
import { join } from "node:path";

type IdentityMap = Record<string, string>;
type ProfileEntry = {
  linkedIdentities: Array<{ provider: string; externalId: string }>;
};
type ProfilesMap = Record<string, ProfileEntry>;

interface CachedData<T> {
  value: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CachedData<unknown>>();

async function cachedRead<T>(path: string): Promise<T> {
  const entry = cache.get(path);
  if (entry && Date.now() < entry.expiresAt) return entry.value as T;

  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw) as T;
  cache.set(path, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
  return parsed;
}

export async function resolvePhone(profilesDataDir: string, channel: string, senderId: string): Promise<string | null> {
  try {
    const map = await cachedRead<IdentityMap>(join(profilesDataDir, "identity-map.json"));
    const canonicalId = map[`${channel}:${senderId}`];
    if (!canonicalId) return null;

    const profiles = await cachedRead<ProfilesMap>(join(profilesDataDir, "profiles.json"));
    const profile = profiles[canonicalId];
    if (!profile) return null;

    const mobile = profile.linkedIdentities.find((li) => li.provider === "mobile");
    return mobile?.externalId ?? null;
  } catch {
    return null;
  }
}

/** Exposed for testing */
export function _clearCache(): void {
  cache.clear();
}
