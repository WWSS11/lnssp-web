const STATUS_LABELS: Record<string, string> = {
  draft: "草稿",
  staging: "预发布",
  prod: "正式发布",
  published: "已发布",
  retired: "已停用",
  active: "启用中",
  inactive: "已停用",
  pending: "待处理",
};

const ENTITY_LABELS: Record<string, string> = {
  rule: "规则",
  rule_set: "规则集",
  ruleSet: "规则集",
  param: "参数",
  policy_param: "政策参数",
};

const SOURCE_LABELS: Record<string, string> = {
  regression: "回归测试",
  example: "示例测试",
  imported: "导入数据",
  manual: "手动创建",
};

const MODULE_LABELS: Record<string, string> = {
  normalization: "数据规范化",
  retirement: "退休政策",
  pension: "养老保险",
  medical_insurance: "医疗保险",
  unemployment: "失业保险",
  subsidy: "补贴政策",
  contribution: "缴费管理",
  plan: "方案生成",
  gate: "最终审核",
};

const CHECK_LABELS: Record<string, string> = {
  schema: "数据格式校验",
  examples: "示例测试",
  regression: "回归测试",
  dual_review: "双人复核",
  transition: "发布流程校验",
  rule_exists: "规则存在性校验",
  draft_to_staging: "草稿转预发布校验",
  value: "参数值校验",
  effective_period: "有效期校验",
  source: "政策来源校验",
  applicability: "适用范围校验",
  review: "审核状态校验",
};

export function getStatusLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export function getStageLabel(value: string): string {
  return STATUS_LABELS[value] ?? value;
}

export function getEntityLabel(value: string): string {
  return ENTITY_LABELS[value] ?? value;
}

export function getSourceLabel(value: string): string {
  return SOURCE_LABELS[value] ?? value;
}

export function getModuleLabel(value: string): string {
  return MODULE_LABELS[value] ?? value;
}

export function getCheckLabel(value: string): string {
  return CHECK_LABELS[value] ?? value;
}

export function getCheckDetail(value: string): string {
  if (value === "no tests") return "尚未配置测试";
  if (value === "run error") return "测试运行出错";
  return value
    .replaceAll("pass rate", "通过率")
    .replaceAll("re-run", "重新运行")
    .replaceAll("tests", "项测试");
}
