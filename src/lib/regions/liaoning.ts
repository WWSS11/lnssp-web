/** 辽宁省级产品当前支持的地市白名单。 */
export const LIAONING_CITIES = [
  "沈阳",
  "大连",
  "鞍山",
  "抚顺",
  "本溪",
  "丹东",
  "锦州",
  "营口",
  "阜新",
  "辽阳",
  "盘锦",
  "铁岭",
  "朝阳",
  "葫芦岛",
] as const;

export type LiaoningCity = (typeof LIAONING_CITIES)[number];

const CITY_SET = new Set<string>(LIAONING_CITIES);

/**
 * 将“辽宁省沈阳市”“沈阳市”等常见写法归一为“沈阳”。
 * 返回 null 表示不是当前支持的辽宁地市，调用方不得继续套用辽宁参数。
 */
export function normalizeLiaoningCity(value: string): LiaoningCity | null {
  const normalized = value
    .trim()
    .replace(/^辽宁省?/, "")
    .replace(/市$/, "")
    .trim();

  return CITY_SET.has(normalized) ? (normalized as LiaoningCity) : null;
}
