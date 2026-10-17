import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/env";

export const X_CAL_USER_ID = "x-cal-user-id";

export const sha256Hash = (token: string): string => createHash("sha256").update(token).digest("hex");

export const isApiKey = (authString: string, prefix: string): boolean =>
  authString?.startsWith(prefix ?? "cal_");

export const stripApiKey = (apiKey: string, prefix?: string): string => apiKey.replace(prefix ?? "cal_", "");

export const isAdminApiKey = (token: string | undefined): boolean => {
  const adminApiKey = getEnv("ADMIN_API_KEY", "");
  if (!adminApiKey || !token) return false;
  // Hash both values so timingSafeEqual gets equal-length buffers and the compare is constant-time.
  return timingSafeEqual(
    createHash("sha256").update(token).digest(),
    createHash("sha256").update(adminApiKey).digest()
  );
};
