import { describe, expect, it } from "vitest";
import { LIAONING_CITIES } from "@/lib/regions/liaoning";
import {
  DEFAULT_POLICY_PACK_ID,
  getCityPolicyPackId,
  selectPolicyPacksForUser,
} from "../region-config";

describe("辽宁地域政策包选择", () => {
  it("14市按养老、医保、失业分别拥有稳定目标包标识", () => {
    const ids = LIAONING_CITIES.flatMap((city) =>
      (["pension", "medical", "unemployment"] as const).map((domain) =>
        getCityPolicyPackId(city, domain),
      ),
    );
    expect(new Set(ids).size).toBe(42);
  });

  it("按事项使用各自城市，并只对未发布的事项降级", () => {
    const available = [
      DEFAULT_POLICY_PACK_ID,
      "LIAONING_DALIAN_PENSION",
      "LIAONING_ANSHAN_MEDICAL",
    ];
    const selection = selectPolicyPacksForUser(
      {
        basic: { target_city: "沈阳" },
        locations: {
          pension_insured_city: "大连",
          medical_benefit_city: "鞍山",
          unemployment_benefit_city: "抚顺",
        },
      },
      available,
    );

    expect(selection.domains.pension.resolvedPolicyPackId).toBe(
      "LIAONING_DALIAN_PENSION",
    );
    expect(selection.domains.medical.resolvedPolicyPackId).toBe(
      "LIAONING_ANSHAN_MEDICAL",
    );
    expect(selection.domains.unemployment.requestedPolicyPackId).toBe(
      "LIAONING_FUSHUN_UNEMPLOYMENT",
    );
    expect(selection.domains.unemployment.resolvedPolicyPackId).toBe(
      DEFAULT_POLICY_PACK_ID,
    );
    expect(selection.scope).toBe("mixed");
  });

  it("未知显式包不会进入加载链路", () => {
    const selection = selectPolicyPacksForUser(
      { basic: { target_city: "沈阳" } },
      [DEFAULT_POLICY_PACK_ID],
      "ATTACKER_PACK",
    );
    expect(selection.resolvedPolicyPackIds).toEqual([DEFAULT_POLICY_PACK_ID]);
  });
});
