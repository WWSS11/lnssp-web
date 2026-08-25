export const PUBLIC_SHOWCASE_PROVINCE = "辽宁省" as const;
export const PUBLIC_SHOWCASE_REVIEW_STATUS = "approved" as const;

export interface ShowcasePublicationCandidate {
  province?: string | null;
  city?: string | null;
  reviewStatus?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: Date | string | null;
  policyDataAsOf?: string | null;
  officialSources?: unknown;
  isPublished?: boolean;
}

export function isPublicShowcaseCandidate(
  candidate: ShowcasePublicationCandidate,
): boolean {
  return (
    candidate.isPublished === true &&
    candidate.province === PUBLIC_SHOWCASE_PROVINCE &&
    Boolean(candidate.city) &&
    candidate.reviewStatus === PUBLIC_SHOWCASE_REVIEW_STATUS &&
    Boolean(candidate.reviewedBy) &&
    Boolean(candidate.reviewedAt) &&
    Boolean(candidate.policyDataAsOf) &&
    Array.isArray(candidate.officialSources) &&
    candidate.officialSources.length > 0
  );
}
