import { LIAONING_CITIES, type LiaoningCity } from "@/lib/regions/liaoning";

export const DEFAULT_RULE_SET_ID = "RS-LIAONING-PLAN-V1";
export const DEFAULT_POLICY_PACK_ID = "LIAONING_BASE";

export type PolicyDomain = "pension" | "medical" | "unemployment";

export interface DomainPolicyPackSelection {
  domain: PolicyDomain;
  city: LiaoningCity | null;
  requestedPolicyPackId: string | null;
  resolvedPolicyPackId: string;
  scope: "province" | "city";
}

export interface PolicyPackSelection {
  resolvedPolicyPackIds: string[];
  domains: Record<PolicyDomain, DomainPolicyPackSelection>;
  scope: "province" | "mixed" | "city";
}

const CITY_SEGMENTS: Record<LiaoningCity, string> = {
  沈阳: "SHENYANG", 大连: "DALIAN", 鞍山: "ANSHAN", 抚顺: "FUSHUN",
  本溪: "BENXI", 丹东: "DANDONG", 锦州: "JINZHOU", 营口: "YINGKOU",
  阜新: "FUXIN", 辽阳: "LIAOYANG", 盘锦: "PANJIN", 铁岭: "TIELING",
  朝阳: "CHAOYANG", 葫芦岛: "HULUDAO",
};

/** 每个险种独立路由，避免用养老参保地替代医保或失业待遇地。 */
export function selectPolicyPacksForUser(
  user: Record<string, unknown>,
  availablePolicyPackIds: Iterable<string> = [],
  explicitlyRequested?: string,
): PolicyPackSelection {
  const basic = asRecord(user.basic);
  const locations = asRecord(user.locations);
  const available = new Set(availablePolicyPackIds);
  available.add(DEFAULT_POLICY_PACK_ID);

  const legacyCity = asCity(basic.target_city);
  const cities: Record<PolicyDomain, LiaoningCity | null> = {
    pension: asCity(locations.pension_insured_city) ?? legacyCity,
    medical:
      asCity(locations.medical_benefit_city) ??
      asCity(locations.medical_insured_city) ??
      legacyCity,
    unemployment:
      asCity(locations.unemployment_benefit_city) ?? legacyCity,
  };

  const domains = Object.fromEntries(
    (["pension", "medical", "unemployment"] as const).map((domain) => {
      const city = cities[domain];
      const requestedPolicyPackId = city
        ? getCityPolicyPackId(city, domain)
        : null;
      const resolvedPolicyPackId =
        requestedPolicyPackId && available.has(requestedPolicyPackId)
          ? requestedPolicyPackId
          : DEFAULT_POLICY_PACK_ID;
      return [
        domain,
        {
          domain,
          city,
          requestedPolicyPackId,
          resolvedPolicyPackId,
          scope:
            resolvedPolicyPackId === DEFAULT_POLICY_PACK_ID
              ? "province"
              : "city",
        },
      ];
    }),
  ) as Record<PolicyDomain, DomainPolicyPackSelection>;

  // 受控历史/后台调用可指定一个已经发布的包；未知客户端字符串永不进入加载链路。
  const explicit =
    explicitlyRequested && available.has(explicitlyRequested)
      ? explicitlyRequested
      : null;
  const resolvedPolicyPackIds = [
    DEFAULT_POLICY_PACK_ID,
    ...(explicit ? [explicit] : []),
    ...Object.values(domains).map((selection) => selection.resolvedPolicyPackId),
  ].filter((id, index, ids) => ids.indexOf(id) === index);
  const cityCount = Object.values(domains).filter(
    (selection) => selection.scope === "city",
  ).length;

  return {
    resolvedPolicyPackIds,
    domains,
    scope: cityCount === 0 ? "province" : cityCount === 3 ? "city" : "mixed",
  };
}

export function getCityPolicyPackId(
  city: LiaoningCity,
  domain: PolicyDomain,
): string {
  return `LIAONING_${CITY_SEGMENTS[city]}_${domain.toUpperCase()}`;
}

export function isKnownLiaoningCityPackId(value: string): boolean {
  return LIAONING_CITIES.some((city) =>
    (["pension", "medical", "unemployment"] as const).some(
      (domain) => getCityPolicyPackId(city, domain) === value,
    ),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asCity(value: unknown): LiaoningCity | null {
  return typeof value === "string" && LIAONING_CITIES.includes(value as LiaoningCity)
    ? (value as LiaoningCity)
    : null;
}
