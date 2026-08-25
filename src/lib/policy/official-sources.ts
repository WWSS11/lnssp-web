export type PolicyTopic =
  | "retirement"
  | "pension_contribution"
  | "medical_insurance"
  | "unemployment"
  | "employment_subsidy";

export interface OfficialPolicySource {
  topic: PolicyTopic;
  /** 同一文件同时约束的其他政策主题，供问答工具跨主题召回。 */
  related_topics?: readonly PolicyTopic[];
  title: string;
  document_no: string;
  official_url: string;
  effective_from: string;
  effective_to: string | null;
  reviewed_at: string;
  scope: string;
  /** 人工核验的政策要点；模型只能据此概括，不靠记忆补充政策数字。 */
  key_points?: readonly string[];
}

/**
 * 仅收录已经人工核验的官方页面。普通政策问答必须先从这里取得来源，
 * 找不到时应缩小结论并引导用户向经办机构核实，不能靠模型记忆补造。
 */
export const OFFICIAL_POLICY_SOURCES: readonly OfficialPolicySource[] = [
  {
    topic: "retirement",
    related_topics: ["pension_contribution"],
    title: "全国人民代表大会常务委员会关于实施渐进式延迟法定退休年龄的决定",
    document_no: "全国人大常委会决定（2024年9月13日通过）",
    official_url: "https://www.npc.gov.cn/npc/c2/kgfb/202409/t20240913_439534.html",
    effective_from: "2025-01-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "全国",
    key_points: [
      "2029年及以前按月领取基本养老金最低缴费年限为15年。",
      "2030年起最低缴费年限每年提高6个月，2039年达到20年。",
      "过渡表：2030年15年6个月、2031年16年、2032年16年6个月、2033年17年、2034年17年6个月、2035年18年、2036年18年6个月、2037年19年、2038年19年6个月、2039年及以后20年。",
    ],
  },
  {
    topic: "retirement",
    title: "实施弹性退休制度暂行办法",
    document_no: "人社部发〔2024〕94号",
    official_url: "https://www.mohrss.gov.cn/wap/zc/zcwj/202501/t20250101_533701.html",
    effective_from: "2025-01-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "全国",
  },
  {
    topic: "pension_contribution",
    title: "关于规范企业职工基本养老保险省级统筹统一养老保险政策的若干意见",
    document_no: "辽人社〔2020〕23号",
    official_url: "https://liaoning.chinatax.gov.cn/art/2020/5/29/art_5821_45007.html",
    effective_from: "2020-07-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "辽宁省",
  },
  {
    topic: "pension_contribution",
    title: "关于公布2025年养老保险缴费基数上下限和计发基数等有关问题的通知",
    document_no: "辽人社〔2025〕17号",
    official_url: "https://liaoning.chinatax.gov.cn/art/2025/9/15/art_5869_7692.html",
    effective_from: "2025-01-01",
    effective_to: "2025-12-31",
    reviewed_at: "2026-08-20",
    scope: "辽宁省（2025年度）",
  },
  {
    topic: "medical_insurance",
    title: "辽宁省贯彻落实医疗保障待遇清单制度实施方案",
    document_no: "辽医保发〔2021〕9号",
    official_url: "https://ybj.ln.gov.cn/ybj/zwgk/zcwjyjd/2026012816213639438/index.shtml",
    effective_from: "2021-09-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "辽宁省；地市过渡口径仍须核验",
  },
  {
    topic: "unemployment",
    title: "关于进一步规范失业保险省级统筹统一失业保险政策的若干意见",
    document_no: "辽宁省失业保险省级统筹配套政策（2021年）",
    official_url: "https://rst.ln.gov.cn/rst/zfxx/zc/ywfl/shbx/2024092011403688129/index.shtml",
    effective_from: "2022-01-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "辽宁省",
  },
  {
    topic: "unemployment",
    title: "关于领取失业保险金人员参加职工基本医疗保险有关问题的通知",
    document_no: "辽人社〔2011〕221号",
    official_url: "https://rst.ln.gov.cn/rst/zfxx/zc/ywfl/shbx/2024092013500739037/index.shtml",
    effective_from: "2011-07-01",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "辽宁省",
  },
  {
    topic: "unemployment",
    title: "关于大龄领取失业保险金人员参加企业职工基本养老保险有关事项的通知",
    document_no: "辽人社〔2025〕1号",
    official_url: "https://rst.ln.gov.cn/rst/zfxx/fdzdgknr/lzyj/rstgfxwj/lrs/2025020811105037146/index.shtml",
    effective_from: "2025-01-01",
    effective_to: "2039-12-31",
    reviewed_at: "2026-08-20",
    scope: "辽宁省",
  },
  {
    topic: "employment_subsidy",
    title: "辽宁省就业补助资金管理办法",
    document_no: "辽财社规〔2024〕8号",
    official_url: "https://czt.ln.gov.cn/czt/zfxxgk/zc/xzgfxwj/2025082914544599331/index.shtml",
    effective_from: "2024-09-18",
    effective_to: null,
    reviewed_at: "2026-08-20",
    scope: "辽宁省级上限原则；地市标准另行核验",
  },
] as const;

export function findOfficialPolicySources(topic: PolicyTopic) {
  return OFFICIAL_POLICY_SOURCES.filter(
    (source) =>
      source.topic === topic || source.related_topics?.includes(topic),
  );
}
