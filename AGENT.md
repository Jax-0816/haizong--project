# AGENT.md

## 项目概述

这是一个面向 B 端自媒体账号的内容创作工作台，当前核心场景是火锅食材供应链账号。它不是单纯素材文件夹，而是围绕“调研、决策、选题、脚本、素材、发布复盘”形成的内容生产系统。

项目当前已经接入本地 Node API 代理，并通过 Tavily + DeepSeek 支持联网调研和首页 AI 内容决策。

## 文件优先级

AI 开始任何开发任务前，必须优先阅读：

1. `README.md`
2. `AGENT.md`
3. `docs/TODO.md`
4. `docs/AI_RULES.md`
5. `docs/DATA_SCHEMA.md`
6. `docs/DESIGN.md`

如果文件之间出现冲突，以 `AGENT.md` 和 `README.md` 为准。

## 技术栈

- Vite
- React
- TypeScript
- CSS
- Node HTTP server + Vite middleware
- Tavily Search API
- DeepSeek OpenAI-compatible Chat API
- 静态 JSON 数据 + localStorage 临时保存 AI 结果

## 运行命令

```bash
npm install
npm run dev
npm run build
```

本地访问地址：

```text
http://127.0.0.1:4280/
```

双击启动：

- macOS: `scripts/start-haizong.command`
- Windows: `scripts/start-haizong.bat`

## 环境变量

真实密钥放在 `.env.local`，不要放进 `.env.example`。

`.env.example` 只保留占位符：

```text
TAVILY_API_KEY=your_tavily_api_key
TAVILY_BASE_URL=https://api.tavily.com/search

DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat
```

`.gitignore` 已排除 `.env.local`、`node_modules` 和 `dist`。

## 禁止修改范围

除非用户明确要求，否则不要修改：

- `node_modules/`
- `dist/`
- `package-lock.json`
- `.env.local`

## 核心文件

- `src/App.tsx`：主应用、导航、首页 AI 决策、联网调研、选题池、脚本模板、提示词库、素材库、发布复盘。
- `src/styles.css`：整体样式，目前偏 Serenity/Apple 混合风格。
- `src/types.ts`：选题、热点、复盘、调研请求和调研结果类型。
- `src/data/content.json`：静态业务数据源。
- `server/dev.mjs`：本地 Node API 代理和 Vite middleware。
- `server/services/search.mjs`：Tavily 搜索封装。
- `server/services/llm.mjs`：DeepSeek 调用和结构化 JSON 解析。
- `server/services/research.mjs`：联网调研编排、搜索 query 构造和结果规范化。

## 当前模块

- 首页概览：内容决策驾驶舱，包含规则化作品诊断、热点机会、推荐选题、素材建议，以及 AI 今日决策、AI 热点研判、AI 选题补全、AI 素材建议。
- 联网调研：手动输入调研主题，调用 Tavily + DeepSeek 生成摘要、匹配度、内容角度、选题建议、风险提醒和来源链接。
- 选题池：支持搜索、栏目筛选、脚本状态筛选和详情查看。
- 脚本模板：展示痛点型、清单型、避坑型、案例型、爆品推荐型等脚本结构。
- 提示词库：展示并复制 AI 辅助创作提示词。
- 素材库：沉淀用户痛点、产品资料、案例素材和金句表达。
- 发布复盘：展示作品发布数据和复盘结论。

## API

当前只有一个本地接口：

```text
POST /api/research
```

请求字段：

- `mode`: `general`、`dashboardDecision`、`hotspotMatch`、`topicExpand`、`materialSuggestion`
- `query`
- `targetUser`
- `column`
- `freshness`
- `notes`

注意：

- Tavily 搜索 query 必须保持短，当前后端不会把 `notes` 拼进搜索 query，并会截断到 380 字以内。
- `notes` 会保留给 DeepSeek prompt，用于长上下文分析。
- AI 结果只作为建议展示，不自动写回 `content.json`。

## 数据维护规则

优先维护 `src/data/content.json`。

新增字段时同步更新：

- `src/types.ts`
- 使用字段的组件
- 必要时更新 `README.md`、`docs/AI_RULES.md` 或本文档

当前数据结构包括：

- `positioning`
- `columns`
- `topics`
- `scriptTemplates`
- `prompts`
- `materials`
- `hotspots`
- `iterationSuggestions`
- `priorityTopics`
- `reviews`

## AI 使用原则

- AI 用来做调研、判断、推荐和沉淀建议，不替代人工最终决策。
- 不要生成脱离账号定位的泛流量标题。
- 不要把内容写成普通消费者种草，要保持 B 端经营价值。
- 不要在缺少产品资料时编造产品优势。
- AI 结果进入正式素材库、选题池或复盘结论前，必须人工确认。

## 开发注意事项

- 每次修改后至少运行 `npm run build`。
- 修改首页、导航或调研页面后，刷新 `http://127.0.0.1:4280/` 做人工检查。
- 如果 4280 端口被旧服务占用，先停止旧 node 进程，再运行 `npm run dev`。
- 不要把真实 API Key 写进 `.env.example`、README 或代码。
- 当前 `src/App.tsx` 已经较大，后续新增复杂功能时优先拆组件。

## 下一步优先方向

1. 优化 Tavily 搜索 query 和来源过滤，减少无关来源。
2. 增加作品录入表单，让发布数据能真实进入系统。
3. 增加 AI 复盘助手，根据作品标题、脚本、数据和评论摘要生成复盘。
4. 增加“确认沉淀”能力，把 AI 建议人工确认后写入选题池或素材库。
5. 设计持久化策略：localStorage、文件写回、数据库、飞书、Notion 或 Airtable。
