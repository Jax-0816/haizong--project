import type { IndustryId, IndustryProfile } from "./types";

export const defaultIndustryId: IndustryId = "hotpot";
export const activeIndustryStorageKey = "haizong.active-industry.v1";

const bbqTextMap: Array<[RegExp, string]> = [
  [/火锅食材B端/g, "烧烤食材B端"],
  [/火锅食材/g, "烧烤食材"],
  [/火锅店/g, "烧烤店"],
  [/火锅爆品/g, "烧烤爆品"],
  [/火锅成本/g, "烧烤成本"],
  [/火锅行业/g, "烧烤行业"],
  [/火锅/g, "烧烤"],
  [/毛肚/g, "串品"],
  [/鸭肠/g, "烤串"],
  [/黄喉/g, "烤串"],
  [/丸滑/g, "串品"],
  [/锅底/g, "蘸料"],
  [/小吃甜品/g, "夜宵小吃"],
];

export function normalizeIndustryId(value: unknown, fallback: IndustryId = defaultIndustryId): IndustryId {
  return value === "bbq" || value === "hotpot" ? value : fallback;
}

export function getIndustryProfile(profiles: IndustryProfile[], industryId: IndustryId): IndustryProfile {
  return profiles.find((profile) => profile.id === industryId) ?? profiles[0];
}

export function adaptIndustryText(text: string, profile: IndustryProfile): string {
  if (profile.id !== "bbq") {
    return text;
  }

  return bbqTextMap.reduce((output, [pattern, replacement]) => output.replace(pattern, replacement), String(text ?? ""));
}

export function profileOrFallback(profiles: IndustryProfile[], industryId: IndustryId | undefined): IndustryProfile {
  return getIndustryProfile(profiles, normalizeIndustryId(industryId));
}
