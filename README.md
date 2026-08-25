<div align="center">

<h1>SSP Web — 社保规划系统</h1>

<p>把辽宁社保规划从「政策规则」转成可复核、可解释、可管理的在线规划工具。</p>

<p><strong>规则引擎 + 用户规划对话 + Admin 后台 + AI 解释层</strong></p>

</div>

---

## 项目概览

SSP Web 面向辽宁省社保规划场景，将用户基础信息转化为退休节点、缴费缺口、补贴机会和行动清单，并保留可复核的计算依据。项目采用 schema-first 的数据库管理方式，配套 Admin 后台维护规则、参数、案例与发布流程。

当前生产规则集支持普通法定退休年龄、养老最低缴费年限缺口、辽宁职工医保累计缴费年限初步缺口和失业保险理论总期限初算。特殊工种、病残退休、未核定视同缴费等情形会强制转人工；就业困难人员补贴金额、地市医保办理细则、失业金金额和弹性退休实际资格，在对应地市规则完成审核前不会自动给出确定结论。

地域字段已拆分为养老参保地、医保参保地、医保待遇地、失业待遇领取地和户籍地。辽宁14市均预留独立政策包标识；在地市参数通过审核发布前，系统会明确降级为省级通用提示。出生日期必须完整到日才能输出确定退休日期和最低缴费年限，否则仅返回退休日期区间并继续追问。

| 模块 | 能力 |
| --- | --- |
| 规划对话 | 基于多轮问答收集信息，输出结论、依据与下一步动作 |
| 规则引擎 | 用 JSONLogic + 自定义扩展表达政策规则，支持参数化计算 |
| 案例库 | 沉淀典型社保路径，便于对照和复用 |
| Admin 后台 | 管理规则、参数、规则集、测试案例与发布流程 |
| AI 解释层 | 结合确定性计算结果与大模型解释，降低黑箱风险 |

## 技术栈

| 分类 | 技术 |
| --- | --- |
| Web 框架 | Next.js 16 / React 19 / App Router |
| UI | Tailwind CSS v4 / Lucide Icons |
| 数据库 | Neon PostgreSQL / Drizzle ORM |
| 认证 | NextAuth v5 Credentials |
| AI | AI SDK / OpenAI-compatible API |
| 质量保障 | Vitest / ESLint |

## 快速开始

### 环境要求

- Node.js 20+
- Neon PostgreSQL 数据库

### 本地启动

```bash
npm install
cp .env.local.example .env.local
```

编辑 `.env.local` 后初始化数据库并启动：

```bash
npx drizzle-kit push
POLICY_SEED_ALLOW_PUBLISHED=true npm run seed
npm run dev
```

访问入口：

- 用户端：[http://localhost:3000](http://localhost:3000)
- Admin 后台：[http://localhost:3000/admin](http://localhost:3000/admin)

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | Neon PostgreSQL 连接字符串，建议带 `?sslmode=require` |
| `NEXTAUTH_SECRET` | NextAuth 密钥，可用 `openssl rand -base64 32` 生成 |
| `NEXTAUTH_URL` | 本地为 `http://localhost:3000`，生产为正式域名 |
| `ADMIN_USERNAME` | Admin 登录用户名 |
| `ADMIN_PASSWORD_HASH` | Admin 密码 bcrypt hash |
| `ADMIN_USERS_JSON` | 生产推荐：多个管理员主体的 JSON 数组，每项含稳定 `id`、`username`、`passwordHash`；设置后替代单账号变量 |
| `OPENAI_URL` | OpenAI 或兼容网关地址，默认 `https://api.openai.com/v1` |
| `OPENAI_API_KEY` | OpenAI 或兼容网关 API Key |
| `OPENAI_MODEL` | 对话模型名 |
| `POLICY_SEED_ALLOW_PUBLISHED` | 仅首次受控 bootstrap 使用；常规 seed 不设置，政策数据以 draft 写入 |

生成 Admin 密码 hash：

```bash
node -e "const b = require('bcryptjs'); b.hash('yourpassword', 10).then(console.log)"
```

## 数据库与部署

本项目使用 Drizzle schema，并从辽宁审计加固开始维护版本化增量迁移。新空库可使用 `drizzle-kit push`；已有环境应先备份，再执行 `npm run db:migrate`，不要用 push 猜测性覆盖生产结构。

本次模型新增政策包审核元数据、分险种地市路由、展示案例审核字段和发布实体版本关联。升级已有环境时先执行 `npm run db:migrate`，再运行 `npm run seed`；迁移会把地区/审核状态未知的既有展示案例设为未发布，但不会删除原数据。

生产双人复核必须配置至少两个不同 `id` 的 `ADMIN_USERS_JSON` 管理员。只配置旧的 `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` 时仍可登录和进入 staging，但同一稳定主体无法完成 production 的第二人门禁。请求体中的 `actor` 不再被信任。

部署到 Vercel 时，需要在 Dashboard 配置同名环境变量。首次部署后可在本地指向生产库执行一次种子导入：

```bash
DATABASE_URL=<prod-url> POLICY_SEED_ALLOW_PUBLISHED=true npm run seed
```

`vercel.json` 已配置 `iad1` 区域，并为 `/api/chat` 设置较长的函数超时。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 构建生产版本 |
| `npm run start` | 启动生产服务器 |
| `npm run lint` | 运行 ESLint |
| `npm run test` | 运行 Vitest |
| `npm run seed` | 导入 DSL 规则与参数种子数据 |
| `npm run db:migrate` | 对已有数据库执行版本化增量迁移 |
| `npm run check:liaoning` | 扫描生产源码与 DSL 中的上海规则标识残留 |
| `npx drizzle-kit push` | 同步数据库 schema |
| `npx drizzle-kit studio` | 打开数据库可视化 UI |

> `npm run seed` 只同步辽宁生产规则、参数和测试；`data/` 下的历史归档数据不会进入种子流程。

> 政策 seed 默认写入 `draft` 并必须经过发布门禁。仅首次受控初始化已完成人工复核的空库时，可显式设置 `POLICY_SEED_ALLOW_PUBLISHED=true` 进行 bootstrap；常规政策更新不得使用该开关。

> Admin 的案例和测试导入要求每行包含 `province: "辽宁省"`、辽宁14市之一的 `city` 和 `review_status: "approved"`；检测到上海标识时整批拒绝，不会部分写入。

## 目录结构

```text
src/
├── app/             # App Router 页面与 API 路由
│   ├── (client)/    # 用户端页面：主页、对话、案例
│   ├── admin/       # Admin 后台页面
│   └── api/         # 业务 API 与管理 API
├── components/      # UI、布局、规划结果与向导组件
├── lib/             # auth、db、engine、validators 等核心逻辑
└── types/           # TypeScript 类型定义

docs/
└── architecture.md  # 技术架构说明
```

---

## 交流群

欢迎加入交流群，交流社保规划、规则建模与项目使用反馈。

<p align="center">
  <img src="docs/qun.jpg" alt="交流群二维码" width="25%" />
</p>

## 友情链接

- [Linux.do](https://linux.do/)

## 随意打赏

如果这个项目对你有帮助，欢迎随意打赏支持维护。

<p align="center">
  <img src="docs/dashang.jpg" alt="随意打赏二维码" width="25%" />
</p>
