# DATA_SCHEMA

本文档是 `src/data/content.json` 与 `src/types.ts` 的数据结构约束。后续新增字段时，必须同步更新：

- `src/data/content.json`
- `src/types.ts`
- `server/services/contentStore.mjs` 的服务端校验
- 受影响的前端组件或接口

## 根结构

`content.json` 必须是一个对象，且只允许以下根字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `positioning` | `Positioning` | 是 | 账号定位 |
| `columns` | `string[]` | 是 | 内容栏目列表 |
| `topics` | `Topic[]` | 是 | 选题池 |
| `scriptTemplates` | `ScriptTemplate[]` | 是 | 脚本模板 |
| `prompts` | `PromptTemplate[]` | 是 | AI 提示词模板 |
| `materials` | `MaterialSection[]` | 是 | 素材库分组 |
| `hotspots` | `HotspotOpportunity[]` | 是 | 热点机会 |
| `iterationSuggestions` | `IterationSuggestion[]` | 是 | 内容迭代建议 |
| `priorityTopics` | `PriorityTopic[]` | 是 | 优先选题 |
| `reviews` | `ReviewRecord[]` | 是 | 发布复盘 |
| `topicCategories` | `TopicCategory[]` | 是 | 选题类型枚举镜像 |
| `productions` | `ContentProduction[]` | 是 | 内容生产台保存进度 |

禁止在根对象直接新增临时字段。实验字段必须先进入 `src/types.ts`，再进入服务端校验。

## 枚举

### `TopicCategory`

必须严格使用以下值：

```ts
"行业热点选题" | "节气节日选题" | "产品种草选题" | "B端经营选题" | "用户痛点选题" | "爆品打造选题" | "系列化选题"
```

`content.topicCategories` 必须按以上顺序完整保存，供前端表单和服务端校验复用。

### `ScriptStatus`

```ts
"未写" | "已写" | "已拍" | "已发"
```

### `Priority`

```ts
"高" | "中" | "低"
```

### `ProductionStep`

```ts
"topic" | "research" | "template" | "script" | "materials" | "publish" | "review"
```

## 数据对象

### `Positioning`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 账号定位名称 |
| `audience` | `string` | 目标人群 |
| `promise` | `string` | 账号承诺 |
| `style` | `string` | 内容表达风格 |
| `platforms` | `string[]` | 运营平台 |
| `conversionGoal` | `string` | 转化目标 |

### `Topic`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 选题 ID，推荐格式 `topic-001` |
| `title` | `string` | 选题标题 |
| `column` | `string` | 所属栏目，原则上来自 `columns` |
| `topicCategory` | `TopicCategory` | 选题类型 |
| `contentType` | `string` | 内容形态短标签 |
| `targetUser` | `string` | 目标用户 |
| `painPoint` | `string` | 用户痛点 |
| `businessLink` | `string` | 产品、供应链或经营关联 |
| `hotSource` | `string` | 热点或选题来源 |
| `angle` | `string` | 内容角度 |
| `coreView` | `string` | 核心观点 |
| `platform` | `string` | 推荐发布平台 |
| `format` | `string` | 建议内容形式 |
| `scriptStatus` | `ScriptStatus` | 脚本/发布状态 |
| `publishData` | `PublishData` | 发布数据 |
| `review` | `string` | 复盘结论或待办 |
| `sourceUrls` | `string[]` | 可选，联网来源 |
| `recommendationScore` | `number` | 可选，推荐分 |
| `aiGenerated` | `boolean` | 可选，是否 AI 生成 |
| `riskNotes` | `string[]` | 可选，风险提醒 |

`publishData` 只允许：

```ts
{
  views: number;
  likes: number;
  saves: number;
  comments: number;
  conversions: number;
}
```

所有指标必须是大于等于 `0` 的数字。

### `ScriptTemplate`

```ts
{
  id: string;
  name: string;
  scenario: string;
  steps: string[];
  opener: string;
  platforms: string[];
}
```

### `PromptTemplate`

```ts
{
  id: string;
  purpose: string;
  audience: string;
  body: string;
  outputFields: string[];
}
```

### `MaterialSection`

```ts
{
  id: string;
  title: string;
  description: string;
  items: string[];
}
```

### `HotspotOpportunity`

```ts
{
  id: string;
  title: string;
  type: string;
  window: string;
  matchedColumn: string;
  targetUser: string;
  recommendedAngle: string;
  priority: "高" | "中" | "低";
}
```

### `IterationSuggestion`

```ts
{
  id: string;
  type: string;
  related: string;
  action: string;
  reason: string;
  output: string;
}
```

### `PriorityTopic`

```ts
{
  id: string;
  title: string;
  priority: "高" | "中" | "低";
  reason: string;
  source: string;
}
```

### `ReviewRecord`

```ts
{
  id: string;
  topicTitle: string;
  publishDate: string;
  platform: string;
  views: number;
  likes: number;
  saves: number;
  comments: number;
  conversions: number;
  conclusion: string;
}
```

`publishDate` 使用 `YYYY-MM-DD` 字符串。所有指标必须是大于等于 `0` 的数字。

### `ContentProduction`

```ts
{
  topicId: string;
  currentStep: ProductionStep;
  researchNotes: string;
  selectedTemplateId: string;
  scriptDraft: {
    opener: string;
    structure: string;
    ending: string;
    voiceover: string;
  };
  matchedMaterials: {
    productImages: string[];
    storeScenes: string[];
    foodShots: string[];
    coverReferences: string[];
  };
  publishDraft: {
    title: string;
    description: string;
    hashtags: string[];
    platformCopies: Array<{ platform: string; copy: string }>;
  };
  reviewDraft: {
    publishDate: string;
    platform: string;
    views: number;
    likes: number;
    comments: number;
    saves: number;
    shares: number;
    leads: number;
    optimization: string;
  };
  updatedAt: string;
}
```

`updatedAt` 使用 ISO 时间字符串。`reviewDraft` 中所有指标必须是大于等于 `0` 的数字。

## 本地落盘接口

开发服务提供本地 JSON 读写接口：

### 读取

```http
GET /api/content
```

返回完整 `ContentData`。

### 保存

```http
PUT /api/content
Content-Type: application/json
```

请求体可以是完整 `ContentData`，也可以是：

```json
{
  "content": {
    "...": "完整 ContentData"
  }
}
```

保存流程：

1. 服务端按本文档校验完整数据结构。
2. 校验失败返回 `400`，不会写入文件。
3. 校验成功后写入临时文件，再原子替换 `src/data/content.json`。
4. 返回 `{ "ok": true, "updatedAt": "...", "path": "src/data/content.json" }`。

请求体上限为 `2MB`。这个接口只用于本地开发环境，不做登录、多用户冲突处理和云端同步。

## 维护规则

- 新增字段必须先定义 TS 类型，再补服务端校验，最后更新示例数据。
- 不允许前端把临时 UI 状态直接写入 `content.json`。
- 数组项的 `id` 必须稳定，不能用标题当 ID。
- AI 生成内容入库前必须经过人工确认，并保留 `sourceUrls`、`aiGenerated`、`riskNotes` 等可追溯字段。
- `content.json` 只保存业务数据，不保存密钥、用户登录态、缓存结果或大模型原始响应。
