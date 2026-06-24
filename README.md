# 海宗——项目 · haizong--project

> 🍲 餐饮、火锅与烧烤行业自媒体内容研究 & 创作工作台

海宗是一个面向 B 端内容运营场景的本地 Web 项目，服务于火锅食材供应链账号的**选题 → 调研 → 脚本 → 素材 → 发布复盘**全流程。项目融合了**抖音热搜追踪**、行业话题自动化收集、AI 短视频脚本创作与数据整合能力，帮助内容团队高效产出高质量作品。

---

## 🎯 核心功能

| 模块 | 说明 |
| --- | --- |
| **首页概览** | 内容决策驾驶舱：作品诊断、热点机会、AI 今日决策、AI 热点研判、AI 选题补全、**一周发布计划智能生成与刷新** |
| **联网调研** | 输入主题 → 🎵 抖音 + Tavily 双源搜索 + DeepSeek 分析 → 摘要、匹配度、选题建议、风险提醒 |
| **选题池** | 搜索 / 栏目 / 脚本状态多维筛选，**三源管线（抖音视频 + Tavily 网页 + DeepSeek）**联网候选生成，失败自动降级本地兜底 |
| **内容生产台** | 单选题全流程：调研 → 脚本 → 素材 → 发布复盘，支持保存脚本到模板库 |
| **脚本模板** | 痛点型、清单型、避坑型、案例型、爆品推荐型等结构化脚本模板 |
| **提示词库** | AI 辅助创作提示词展示与一键复制 |
| **素材库** | 用户痛点、产品资料、案例素材、金句表达分类沉淀，支持图片上传 |
| **发布复盘** | 作品发布数据与复盘结论集中展示 |
| **账号管理** | 账号密码登录，管理员可视化创建账号、重置密码和管理权限 |

---

## 📁 项目结构

```
haizong--project/
├── src/                    # 前端源码：React 组件、样式、类型、静态数据
│   ├── App.tsx             # 主应用入口与全局路由
│   ├── styles.css          # Serenity / Apple 混合风格
│   ├── types.ts            # TypeScript 类型定义
│   └── data/content.json   # 静态业务数据源
├── server/                 # 本地 Node API 代理与业务服务
│   ├── dev.mjs             # Vite middleware + API 路由
│   ├── app.mjs             # 独立生产服务入口
│   └── services/           # 抖音搜索、Tavily 搜索、DeepSeek LLM、调研编排、认证、生产台
│       ├── douyinService.mjs   # JustOneAPI 抖音视频搜索封装
├── public/                 # 静态资源与登录页
├── scripts/                # 双平台底层启动脚本
├── launchers/              # 桌面快捷启动器安装脚本
├── launch/                 # Windows 一键启动包
├── docs/                   # 项目文档：设计说明、AI 规则、数据结构、部署指南
├── skills/                 # 🧠 自定义 AI 技能与 Prompt 核心库
├── deploy/                 # 部署配置
├── .cursor/ .claude/ .codex/ .agents/
│   # AI 工具专用配置（已在 .gitignore 中排除，保持仓库整洁）
├── AGENTS.md               # AI 智能体行为约束
├── TODO.md                 # 任务进度与待办
└── .env.example            # 环境变量模板（不含真实密钥）
```

> `.gitignore` 已配置忽略 `.venv/`、`*.log`、`.env.local`、`node_modules/`、`dist/` 及 AI 工具私有目录，确保仓库干净。

---

## 🛠 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端框架 | Vite + React + TypeScript |
| 样式 | CSS（Serenity / Apple 混合风格） |
| 后端服务 | Node.js HTTP Server + Vite Middleware |
| 抖音搜索 | JustOneAPI 抖音视频搜索 V4（综合 / 点赞 / 最新排序；发布时间过滤） |
| AI 搜索 | [Tavily Search API](https://tavily.com/) 网页搜索 |
| AI 对话 | [DeepSeek](https://deepseek.com/) OpenAI-compatible Chat API |
| 数据存储 | 静态 JSON + 本地文件 + localStorage 会话 |

---

## 🚀 启动方式

### 安装依赖

```bash
npm install
```

### 开发环境

```bash
npm run dev
```

访问：<http://127.0.0.1:4280/>

### 生产构建

```bash
npm run build
npm run start
```

### 双击启动

| 平台 | 入口 |
| --- | --- |
| Windows | 双击根目录 `START-HERE.bat`，或 `launch/start.bat` |
| macOS | 双击 `launchers/Open Haizong Project.command` |

桌面快捷方式安装：

- **macOS**：`launchers/Install macOS Desktop Launcher.command`
- **Windows**：`launchers/Install Windows Desktop Shortcut.vbs`

---

## 🔐 环境变量

真实密钥放在 `.env.local`（不提交）。`.env.example` 仅保留占位符：

```text
TAVILY_API_KEY=your_tavily_api_key
TAVILY_BASE_URL=https://api.tavily.com/search

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

JUSTONEAPI_TOKEN=your_justoneapi_token
JUSTONEAPI_BASE_URL=http://47.117.133.51:30015

AUTH_ADMIN_PHONE=13800000000
AUTH_ADMIN_DISPLAY_NAME=海总管理员
AUTH_ADMIN_PASSWORD=replace_with_a_strong_admin_password
AUTH_TOKEN_SECRET=replace_with_a_long_random_secret
AUTH_USERS_PATH=server/data/auth-users.json
```

管理员首次登录使用 `AUTH_ADMIN_PHONE` 和 `AUTH_ADMIN_PASSWORD`。普通成员由管理员在“账号管理”中创建或重置密码。

---

## 📡 API 接口

```text
POST /api/research                       联网调研（🎵 抖音 + Tavily 双源）
POST /api/dashboard/daily-refresh        首页今日推荐与周计划每日刷新
POST /api/topic-candidates/generate      选题候选生成（三源管线：抖音 + Tavily + DeepSeek）
POST /api/topics/refresh                 选题池刷新（生成一周发布计划）
POST /api/topics/confirm                 候选确认入池
POST /api/topics/delete                  删除选题并清理对应生产进度
POST /api/douyin/search                  抖音视频搜索（独立接口）
POST /api/production/save                生产台保存
POST /api/production/research            生产台调研
POST /api/production/generate-script     脚本生成
POST /api/production/generate-publish    发布复盘生成
POST /api/production/save-script-template    保存脚本模板
POST /api/production/delete-script-template  删除脚本模板
PUT  /api/materials/image-assets         素材图片上传
POST /api/materials/expand-phrases       金句扩展
POST /api/auth/login                     登录
GET  /api/auth/profile                   用户信息
POST /api/auth/validate                  校验登录状态
POST /api/auth/logout                    退出登录
GET  /api/auth/users                     用户列表（管理员）
POST /api/auth/users/create              创建账号（管理员）
POST /api/auth/users/delete              删除用户（管理员）
POST /api/auth/users/password            重置密码（管理员）
POST /api/auth/users/status              启用/禁用用户（管理员）
POST /api/auth/users/role                调整用户角色（管理员）
```

---

## ☁️ 上云部署

推荐使用腾讯云 CVM + Docker Compose + Nginx：

1. 在 CVM 安装 Docker、Docker Compose、Nginx
2. 创建 `/opt/haizong-workbench` 和 `/data/haizong/uploads`
3. 参考 `deploy/tencent-cloud.env.example` 创建 `.env.production.local`
4. 本地执行 `./scripts/deploy-cvm-docker.sh <CVM_IP> ~/.ssh/your-key.pem root`
5. 配置 Nginx 反向代理到 `127.0.0.1:4280`

详见 [docs/tencent-cloud-cvm-deploy.md](docs/tencent-cloud-cvm-deploy.md)。

---

## 📋 开发规范

- 每次修改后至少执行 `npm run build` 确保可通过编译
- 修改首页 / 导航 / 调研页面后，刷新浏览器做人工检查
- 端口 4280 被占用时先停旧进程，再启动
- **禁止**将真实 API Key 写入 `.env.example`、README 或代码
- **禁止**提交 `.env.local`、`dist/`、`node_modules/`、`server/data/auth-users.json`
- `src/App.tsx` 已较大，新增复杂功能优先拆组件

---

## 📖 文档索引

| 文件 | 说明 |
| --- | --- |
| [AGENTS.md](AGENTS.md) | AI 智能体行为约束与执行规则 |
| [TODO.md](TODO.md) | 任务进度与待办事项 |
| [docs/AI_RULES.md](docs/AI_RULES.md) | AI 内容生成原则与输出格式 |
| [docs/DESIGN.md](docs/DESIGN.md) | 设计说明 |
| [docs/DATA_SCHEMA.md](docs/DATA_SCHEMA.md) | 数据结构说明 |
| [docs/tencent-cloud-cvm-deploy.md](docs/tencent-cloud-cvm-deploy.md) | 腾讯云 CVM 部署指南 |
