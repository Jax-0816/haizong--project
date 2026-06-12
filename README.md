# 项目说明

海哥自媒体账号内容工作台是一个面向 B 端内容运营场景的本地 Web 项目，当前服务于火锅食材供应链账号的选题、调研、脚本、素材和复盘流程。

## 项目结构

- `docs/`：项目文档，包括设计说明、AI 规则、任务清单、数据结构说明。
- `scripts/`：双系统底层启动脚本。
- `launchers/`：项目内双击入口和桌面启动器安装脚本。
- `src/`：前端源码、样式、类型和 `src/data/content.json` 业务数据。
- `server/`：本地 Node 开发服务、认证服务、Tavily / DeepSeek 接口代理、数据写回服务。
- `public/`：静态资源与原生登录相关脚本。

### 核心文件

- `src/App.tsx`：主应用、导航、首页 AI 决策、联网调研、选题池、脚本模板、提示词库、素材库、发布复盘。
- `src/styles.css`：整体样式（Serenity / Apple 混合风格）。
- `src/types.ts`：选题、热点、复盘、调研请求和调研结果类型。
- `src/data/content.json`：静态业务数据源。
- `server/dev.mjs`：本地 Node API 代理和 Vite middleware。
- `server/services/search.mjs`：Tavily 搜索封装。
- `server/services/llm.mjs`：DeepSeek 调用和结构化 JSON 解析。
- `server/services/research.mjs`：联网调研编排、搜索 query 构造和结果规范化。
- `server/services/authStore.mjs`：手机号验证码登录、账号数据、管理员权限和会话 token。
- `server/services/production.mjs`：内容生产台保存、脚本生成、脚本模板保存/删除和发布复盘写回。

## 技术栈

- **前端框架**：Vite + React + TypeScript
- **样式**：CSS（Serenity / Apple 混合风格）
- **后端服务**：Node HTTP server + Vite middleware
- **AI 搜索**：Tavily Search API
- **AI 对话**：DeepSeek OpenAI-compatible Chat API
- **数据存储**：静态 JSON 数据（`src/data/content.json`）+ 本地账号 JSON（`server/data/auth-users.json`）+ localStorage 会话与临时 AI 结果

## 启动方式

安装依赖：

```bash
npm install
```

启动开发环境：

```bash
npm run dev
```

本地访问：

```text
http://127.0.0.1:4280/
```

生产构建：

```bash
npm run build
npm run start
```

生产环境默认读取：

```text
.env
.env.production
.env.local
.env.production.local
```

建议云上使用 `.env.production.local`，不要提交真实密钥。

## 环境变量

真实密钥放在 `.env.local`，不要放进 `.env.example`。

`.env.example` 只保留占位符：

```text
TAVILY_API_KEY=your_tavily_api_key
TAVILY_BASE_URL=https://api.tavily.com/search

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

AUTH_ADMIN_PHONE=13800000000
AUTH_ADMIN_DISPLAY_NAME=海总管理员
AUTH_TOKEN_SECRET=replace_with_a_long_random_secret
AUTH_USERS_PATH=server/data/auth-users.json
AUTH_CODE_TTL_MS=300000
```

`.gitignore` 已排除 `.env.local`、`node_modules` 和 `dist`。

## 双击启动

项目内已经提供双平台双击入口，默认都会启动开发版并打开：

```text
http://127.0.0.1:4280/
```

如果你要把整个项目发给 Windows 电脑，先解压，然后双击根目录的 **`START-HERE.bat`**：

- Windows：双击根目录 `START-HERE.bat`（或进入 `launch/` 文件夹，双击 `start.bat`）
- 说明文档：`launch/README.md`

> 如果解压后文件名出现乱码，请使用 **7-Zip** 或 **Bandizip** 解压，Windows 自带解压工具可能不兼容跨平台中文文件名。

### 直接在项目内双击

- macOS：双击 `launchers/Open Haizong Project.command`
- Windows：双击 `launchers/Open Haizong Project.bat`

它们都会调用 `scripts/` 里的底层脚本，并自动：

- 检查 `npm` / Node.js 是否可用
- 缺少 `node_modules` 时自动执行 `npm install`
- 打开浏览器访问本地地址
- 启动 `npm run dev`

### 放到桌面双击

- macOS：
  - 双击 `launchers/Install macOS Desktop Launcher.command`
  - 脚本会在桌面生成 `Open Haizong Project.command`
  - 之后双击桌面上的这个文件即可启动项目
- Windows：
  - 双击 `launchers/Install Windows Desktop Shortcut.vbs`
  - 脚本会在桌面生成 `Open Haizong Project.lnk`
  - 之后双击桌面快捷方式即可启动项目

### 首次运行提示

- macOS 第一次双击 `.command` 文件时，如果系统阻止运行，请在“系统设置 > 隐私与安全性”里允许，或右键后选择“打开”。
- Windows 第一次运行脚本时，如果系统弹出安全提示，请确认来源是你自己的项目目录后再继续。
- 关闭终端或命令行窗口后，本地开发服务会停止。

## 上云建议

当前仓库已经支持“开发 / 生产”分离运行：

- 开发环境：`npm run dev`
- 生产环境：先 `npm run build`，再 `npm run start`

如果只是先做腾讯云 CVM 内部试运行，推荐继续使用前后端一体部署：

1. 把整个项目传到腾讯云 CVM
2. 安装 Node.js 20+
3. 配置 `.env.production.local`
4. 执行 `npm install`
5. 执行 `npm run build`
6. 执行 `npm run start`

部署细节见 [docs/tencent-cloud-cvm-deploy.md](/Users/mac/Desktop/haizong-%20project/docs/tencent-cloud-cvm-deploy.md:1)。

## 当前功能模块

- **首页概览**：内容决策驾驶舱，包含规则化作品诊断、热点机会、推荐选题、素材建议，以及 AI 今日决策、AI 热点研判、AI 选题补全、AI 素材建议。
- **联网调研**：手动输入调研主题，调用 Tavily + DeepSeek 生成摘要、匹配度、内容角度、选题建议、风险提醒和来源链接。
- **选题池**：支持搜索、栏目筛选、脚本状态筛选、详情查看、联网候选生成、候选确认入池；联网或大模型失败时会降级生成本地候选。
- **内容生产台**：围绕单个选题完成调研、脚本、素材、发布和复盘；支持保存脚本内容到脚本模板库。
- **脚本模板**：展示痛点型、清单型、避坑型、案例型、爆品推荐型等脚本结构；支持删除从内容生产台保存的脚本记录。
- **提示词库**：展示并复制 AI 辅助创作提示词。
- **素材库**：沉淀用户痛点、产品资料、案例素材和金句表达；支持在指定素材分组上传图片资料并保存产品名称。
- **发布复盘**：展示作品发布数据和复盘结论。
- **账号管理**：使用手机号验证码登录，管理员可查看账号并删除普通成员账号。当前第一阶段为本地模拟验证码，验证码会直接显示在登录页。

## API 接口

当前主要本地接口：

```text
POST /api/research
POST /api/topic-candidates/generate
POST /api/topics/refresh
POST /api/topics/confirm
POST /api/production/save
POST /api/production/research
POST /api/production/generate-script
POST /api/production/generate-publish
POST /api/production/save-script-template
POST /api/production/delete-script-template
PUT  /api/materials/image-assets
POST /api/materials/expand-phrases
POST /api/auth/code/send
POST /api/auth/login
GET  /api/auth/profile
GET  /api/auth/users
POST /api/auth/users/delete
```

请求字段：

| 字段 | 说明 |
| --- | --- |
| `mode` | `general`、`dashboardDecision`、`hotspotMatch`、`topicExpand`、`materialSuggestion` |
| `query` | 搜索/调研关键词 |
| `targetUser` | 目标用户 |
| `column` | 内容栏目 |
| `freshness` | 时效性要求 |
| `notes` | 补充说明 |

注意：

- Tavily 搜索 query 必须保持短，后端会截断到 380 字以内。
- `notes` 会保留给 DeepSeek prompt，用于长上下文分析。
- AI 结果只作为建议展示，不自动写回 `content.json`。
- 选题候选生成支持联网失败兜底，但降级候选没有实时来源，确认入池前需要人工判断。

## 文档说明

- `AGENTS.md`：AI 智能体行为约束和执行规则。
- `docs/AI_RULES.md`：AI 内容生成原则和输出格式。
- `TODO.md`：任务进度和待办事项。
- `docs/DATA_SCHEMA.md`：`src/data/content.json` 与 `src/types.ts` 的数据结构说明。
- `docs/DESIGN.md`：设计说明。

## 开发注意事项

- 每次修改后至少运行 `npm run build`。
- 修改首页、导航或调研页面后，刷新 `http://127.0.0.1:4280/` 做人工检查。
- 如果 4280 端口被旧服务占用，先停止旧 node 进程，再运行 `npm run dev`。
- 不要把真实 API Key 写进 `.env.example`、README 或代码。
- 当前 `src/App.tsx` 已经较大，后续新增复杂功能时优先拆组件。

## 提交注意事项

- 不要提交 `.env.local`、`dist/`、`node_modules/`。
- 不要提交 `server/data/auth-users.json`，里面是本地账号运行数据，可能包含真实手机号。
- `public/uploads/` 是本地上传素材目录；只有确认图片属于正式素材时，才和 `src/data/content.json` 中对应图片元数据一起提交。
- 根目录生成的 `Open Haizong Project.command` 属于本机桌面启动器，不建议提交。

## 注意事项

- 不要修改 `node_modules/`
- 不要修改 `dist/`
- 不要提交 `.env.local` 或任何含真实密钥的文件
- 修改功能前先阅读 `AGENTS.md` 和 `README.md`
