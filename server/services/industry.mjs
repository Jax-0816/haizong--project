export const defaultIndustryId = "hotpot";

export function normalizeIndustryId(value, fallback = defaultIndustryId) {
  return value === "bbq" || value === "hotpot" ? value : fallback;
}

export function getIndustryProfile(content, industryId) {
  const profiles = Array.isArray(content?.industryProfiles) ? content.industryProfiles : [];
  const normalizedIndustryId = normalizeIndustryId(industryId);
  return profiles.find((profile) => profile?.id === normalizedIndustryId) ?? profiles[0] ?? null;
}

export function getTopicIndustry(topic) {
  return normalizeIndustryId(topic?.industry);
}

export function getTopicColumnFallback(content, industryId) {
  const profile = getIndustryProfile(content, industryId);
  return Array.isArray(profile?.columns) && profile.columns.length > 0 ? profile.columns[0] : content?.columns?.[0] ?? "";
}
