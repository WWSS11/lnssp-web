# 数据目录说明

本目录中的 `*v5.xlsx` 和 `test-cases-from-transcripts.json` 来自历史上海社保语料，
仅用于离线归档核对，不属于辽宁生产知识库，不得作为辽宁展示案例、模型上下文或回归基线。

`npm run seed` 不会导入这些历史文件。

辽宁展示案例应写入 `liaoning-showcase-cases-approved.json`，每条至少包含：

- `region.province` 和 `region.city`
- `review_status: "approved"`
- `policy_data_as_of`
- `official_sources`
- 由政策审核人员确认的输入和预期结果

未满足上述字段的案例不得发布到用户端。
