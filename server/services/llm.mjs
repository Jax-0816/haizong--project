import { requireEnv } from "../config.mjs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_LLM_TIMEOUT_MS = 30000;

export async function generateResearchInsight({ request, accountContext, sources, industry }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是一个餐饮供应链 B 端自媒体调研助手。你必须基于给定搜索来源做判断，不要编造来源、数据、品牌事实或产品优势。只返回 JSON。",
        },
        {
          role: "user",
          content: buildPrompt({ request, accountContext, sources, industry }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

export async function generateTopicCandidates({ request, accountContext, sources, industry }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const timeoutMs = normalizeTimeout(process.env.DEEPSEEK_TIMEOUT_MS, DEFAULT_LLM_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "你是一个餐饮供应链 B 端自媒体选题策略助手。你必须基于给定搜索来源生成候选选题，不要编造来源、数据、品牌事实或产品优势。只返回 JSON。",
          },
          {
            role: "user",
            content: buildTopicCandidatePrompt({ request, accountContext, sources, industry }),
          },
        ],
      }),
    });
  } catch (caught) {
    const isTimeout = caught?.name === "AbortError";
    const error = new Error(isTimeout ? "大模型生成超时，已改用本地资料生成候选。" : "大模型服务连接失败，已改用本地资料生成候选。");
    error.statusCode = 502;
    error.code = isTimeout ? "LLM_TIMEOUT" : "LLM_FETCH_FAILED";
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

export async function generateWeeklyPlan({ industry, industryLabel, weeklyPlanContext }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个抖音餐饮 B 端自媒体运营专家，专注于为餐饮供应链账号制定周度发布计划。你需要根据选题池中的真实选题，为周一到周五每天挑选最合适的选题作为当日发布内容，并给出推荐理由。只返回 JSON。`,
        },
        {
          role: "user",
          content: buildWeeklyPlanPrompt({ industry, industryLabel, weeklyPlanContext }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`周计划生成失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回周计划内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

function normalizeTimeout(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1000 ? parsed : fallback;
}

export async function generateProductionScript({ topic, template, researchNotes, materials }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个${getIndustryLabel(topic.industry)}B端账号短视频编导。生成脚本必须服务门店经营价值，不能写成普通消费者种草。只返回 JSON。`,
        },
        {
          role: "user",
          content: buildProductionScriptPrompt({ topic, template, researchNotes, materials }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

export async function generateProductionPublish({ topic, scriptDraft, platforms }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个${getIndustryLabel(topic.industry)}B端账号发布运营。生成标题、简介、话题和平台文案，必须专业、直接、重经营价值。只返回 JSON。`,
        },
        {
          role: "user",
          content: buildProductionPublishPrompt({ topic, scriptDraft, platforms }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

function buildPrompt({ request, accountContext, sources, industry }) {
  const industryLabel = getIndustryLabel(industry);
  const taskByMode = {
    dashboardDecision: `请为${industryLabel}首页内容决策驾驶舱生成今日 AI 决策：指出今天最值得做的方向、3条可执行选题、需要补充的素材、风险提醒。`,
    hotspotMatch: `请判断这个热点是否适合当前${industryLabel}账号，并给出内容角度、风险提醒和可延展选题。`,
    topicExpand: `请把这个${industryLabel}推荐选题补全成可执行内容方案，包含目标用户、痛点、角度、核心观点、平台和形式。`,
    materialSuggestion: `请根据${industryLabel}素材迭代线索，建议应该补充哪些痛点、金句、产品资料或案例素材。`,
    general: `请根据搜索结果，为${industryLabel}B端账号生成联网调研结论。`,
  };
  const task = taskByMode[request.mode] ?? taskByMode.general;

  return JSON.stringify(
    {
      task,
      accountContext,
      request,
      sources,
      outputSchema: {
        summary: "行业/热点摘要，120字以内",
        matchScore: "高 | 中 | 低",
        matchedReason: "为什么适合或不适合当前账号",
        angles: ["适合做的内容角度，3到5条"],
        topicIdeas: [
          {
            title: "选题标题",
            targetUser: "目标用户",
            angle: "内容角度",
            coreView: "核心观点",
            platform: "推荐平台",
            format: "内容形式",
          },
        ],
        risks: ["风险提醒，2到4条"],
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        "topicIdeas 输出 3 到 5 条。",
        "所有建议必须服务 B 端经营价值，不要写普通消费者种草内容。",
        "如果来源不足，matchScore 降低，并在 risks 中说明。",
        "如果 accountContext 中包含 douyinTrends（抖音热门视频数据），请结合 title、digg_count（点赞数）、comment_count（评论数）判断内容热度趋势，优先引用高互动视频的选题方向，并在 matchedReason 中说明抖音热度参考。",
      ],
    },
    null,
    2,
  );
}

function buildTopicCandidatePrompt({ request, accountContext, sources, industry }) {
  const industryLabel = getIndustryLabel(industry);
  const categoryRules = {
    行业热点选题: `围绕餐饮趋势、${industryLabel}行业、消费变化和供应链热点，判断能否转成 B 端经营内容。`,
    节气节日选题: "围绕节日节点、节气、备货、套餐和旺季淡季，给门店可执行的备货或营销角度。",
    产品种草选题: `围绕产品卖点、使用场景和采购理由，但必须落到 B 端采购、毛利、复购或出餐效率。`,
    B端经营选题: "围绕成本、毛利、翻台、菜单结构、后厨效率和供应链稳定。",
    用户痛点选题: "围绕采购、损耗、出餐、复购、标准化、库存等门店真实痛点。",
    爆品打造选题: "围绕招牌菜、爆款食材、套餐组合和复购逻辑，避免空泛营销话术。",
    系列化选题: "把主题拆成 3 到 7 条递进式选题，每条要有清晰顺序和差异角度。",
  };

  return JSON.stringify(
    {
        task: "请根据搜索来源生成可人工确认入池的候选选题。",
        categoryRule: categoryRules[request.category],
        accountContext,
        request,
        sources,
      outputSchema: {
        candidates: [
          {
            title: "选题标题",
            topicCategory: request.category,
            targetUser: "目标用户",
            painPoint: "用户痛点",
            hotSource: "热点依据或来源依据",
            angle: "内容角度",
            coreView: "核心观点",
            businessLink: "业务关联",
            platform: "推荐平台",
            format: "内容形式",
            sourceUrls: ["必须来自 sources 中的 url"],
            recommendationScore: "0 到 100 的整数",
            risks: ["风险提醒"],
          },
        ],
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        `candidates 输出 ${request.limit} 条以内。`,
        "topicCategory 必须等于 request.category。",
        "sourceUrls 必须引用 sources 中真实存在的 url；如果来源不足，sourceUrls 可以为空，但 recommendationScore 不能超过 60。",
        "所有建议必须服务 B 端经营价值，不要写普通消费者种草内容。",
        "不要编造产品优势、价格、销量、排名或平台数据。",
        "如果 accountContext 中包含 douyinTrends（抖音热门视频数据），请结合 title、digg_count（点赞数）、comment_count（评论数）判断内容热度趋势，优先引用高互动视频的选题方向，并在 hotSource 中体现抖音热度参考。",
      ],
    },
    null,
    2,
  );
}

function buildProductionScriptPrompt({ topic, template, researchNotes, materials }) {
  return JSON.stringify(
    {
      task: `请基于选题、调研依据、脚本模板和素材线索，生成一条 60 到 90 秒的${getIndustryLabel(topic.industry)}短视频脚本草稿。`,
      topic,
      template,
      researchNotes,
      materials,
      outputSchema: {
        opener: "开头钩子，20字以内",
        structure: "正文结构，按 3 到 5 个段落列出",
        ending: `结尾引导，面向${getIndustryAudience(topic.industry)}`,
        voiceover: "完整口播文案",
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        "必须讲清 B 端经营逻辑。",
        "可以关联产品或供应链能力，但不要编造产品事实。",
        "避免普通消费者种草语气。",
      ],
    },
    null,
    2,
  );
}

function buildProductionPublishPrompt({ topic, scriptDraft, platforms }) {
  return JSON.stringify(
    {
      task: `请基于选题和脚本生成${getIndustryLabel(topic.industry)}发布内容。`,
      topic,
      scriptDraft,
      platforms,
      outputSchema: {
        title: "发布标题",
        description: "发布简介",
        hashtags: ["话题标签"],
        platformCopies: [
          {
            platform: "平台名",
            copy: "平台适配文案",
          },
        ],
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        "标题专业直接，不要夸张标题党。",
        `平台文案要适合 B 端${getIndustryAudience(topic.industry)}阅读。`,
      ],
    },
    null,
    2,
  );
}

function getIndustryLabel(industry) {
  return industry === "bbq" ? "烧烤食材供应链" : "火锅食材供应链";
}

function getIndustryAudience(industry) {
  return industry === "bbq"
    ? "烧烤店老板、餐饮采购负责人和后厨负责人"
    : "火锅店老板、采购负责人和后厨负责人";
}

function parseModelJson(content) {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "");

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    try {
      return JSON.parse(escapeControlCharsInJsonStrings(cleaned));
    } catch {
      // Continue to object-slice fallback below.
    }

    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      try {
        return JSON.parse(sliced);
      } catch {
        return JSON.parse(escapeControlCharsInJsonStrings(sliced));
      }
    }
    const error = new Error(`大模型返回内容不是合法 JSON：${firstError.message}`);
    error.statusCode = 502;
    throw error;
  }
}

function escapeControlCharsInJsonStrings(value) {
  let output = "";
  let inString = false;
  let escaped = false;

  for (const char of value) {
    if (!inString) {
      output += char;
      if (char === "\"") {
        inString = true;
      }
      continue;
    }

    if (escaped) {
      output += char;
      escaped = false;
      continue;
    }

    if (char === "\\") {
      output += char;
      escaped = true;
      continue;
    }

    if (char === "\"") {
      output += char;
      inString = false;
      continue;
    }

    if (char === "\n") {
      output += "\\n";
      continue;
    }

    if (char === "\r") {
      output += "\\r";
      continue;
    }

    if (char === "\t") {
      output += "\\t";
      continue;
    }

    output += char;
  }

  return output;
}

export async function refreshScriptTemplate({ template, industry }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const industryLabel = getIndustryLabel(industry);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.7,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个${industryLabel}B端自媒体短视频编导。你需要为已有的脚本模板生成全新的文案内容，保持相同的模板结构和步骤数量，但换用全新的角度、场景和表达。只返回 JSON。`,
        },
        {
          role: "user",
          content: buildScriptRefreshPrompt({ template, industryLabel }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

function buildScriptRefreshPrompt({ template, industryLabel }) {
  const stepCount = template.steps.length;

  return JSON.stringify(
    {
      task: `请为以下"${template.name}"脚本模板生成一套全新的文案内容。保持相同的模板结构（${stepCount} 个步骤）、相同的步骤数量和逻辑框架，但换用全新的话题角度、场景切入和文案表达。`,
      currentTemplate: {
        name: template.name,
        scenario: template.scenario,
        steps: template.steps,
        opener: template.opener,
        platforms: template.platforms,
      },
      outputSchema: {
        scenario: "新适用场景，一句话说明，20字以内",
        steps: template.steps.map((_, i) => `第${i + 1}步新文案，15字以内`),
        opener: "新开头钩子，30字以内，保留B端经营口吻",
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        `steps 必须恰好 ${stepCount} 条，不多不少。`,
        "新内容必须围绕 B 端经营价值（成本、毛利、效率、供应链、门店运营）。",
        `内容必须适配${industryLabel}行业，不要混入其他品类。`,
        "不要换模板名称和平台信息，只刷新 scenario、steps 和 opener。",
        "新文案要和原内容完全不同，换角度、换场景、换表达。",
        "保持专业直接的口吻，不要过度营销。",
      ],
    },
    null,
    2,
  );
}

export async function expandMaterialPhrases({ sectionTitle, existingItems, industry }) {
  const apiKey = requireEnv("DEEPSEEK_API_KEY", "缺少 DEEPSEEK_API_KEY，请在 .env.local 中配置 DeepSeek API Key。");
  const baseUrl = (process.env.DEEPSEEK_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = process.env.DEEPSEEK_MODEL || DEFAULT_MODEL;
  const industryLabel = getIndustryLabel(industry);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `你是一个${industryLabel}B端自媒体内容编辑。你需要为素材库的"${sectionTitle}"板块补充全新的金句表达。每条金句15-40字，短促有力、适合短视频口播，必须服务B端经营价值。不要重复已有金句。只返回 JSON。`,
        },
        {
          role: "user",
          content: buildMaterialExpandPrompt({ sectionTitle, existingItems, industryLabel }),
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`大模型请求失败：${response.status} ${detail}`);
    error.statusCode = 502;
    throw error;
  }

  const payload = await response.json();
  const content = payload?.choices?.[0]?.message?.content;

  if (!content) {
    const error = new Error("大模型没有返回可解析内容。");
    error.statusCode = 502;
    throw error;
  }

  return parseModelJson(content);
}

function buildMaterialExpandPrompt({ sectionTitle, existingItems, industryLabel }) {
  return JSON.stringify(
    {
      task: `请为${industryLabel}素材库的"${sectionTitle}"板块生成 5 条全新的金句表达。每条金句要短促有力（15-40字），适合短视频口播，围绕B端经营逻辑（成本、利润、供应链、门店运营、采购决策）。`,
      existingItems,
      outputSchema: {
        items: ["新金句1", "新金句2", "新金句3", "新金句4", "新金句5"],
      },
      rules: [
        "只输出 JSON，不要 Markdown。",
        "items 必须恰好 5 条。",
        "每条 15-40 字，短促有力。",
        "不要重复 existingItems 中已有的表达。",
        "新金句必须不同于已有内容，换角度、换切入点。",
        "必须服务 B 端经营价值，不要写普通消费者种草内容。",
        `内容必须适配${industryLabel}行业。`,
      ],
    },
    null,
    2,
  );
}

function buildWeeklyPlanPrompt({ industry, industryLabel, weeklyPlanContext }) {
  const dayThemes = {
    周一: { theme: "行业热点 / 经营判断", focus: "从选题池中挑选行业趋势、经营判断、供应链热点类选题" },
    周二: { theme: "产品选品指南", focus: "从选题池中挑选产品种草、食材选品、采购指南类选题" },
    周三: { theme: "痛点解决", focus: "从选题池中挑选用户痛点、B端经营、成本控制类选题" },
    周四: { theme: "案例拆解", focus: "从选题池中挑选案例拆解、门店复盘、成功模式类选题" },
    周五: { theme: "节日借势 / 套餐建议", focus: "从选题池中挑选节日节气、套餐组合、爆品打造类选题" },
  };

  return JSON.stringify(
    {
      task: `你是${industryLabel}抖音 B 端自媒体账号的运营负责人。请根据选题池中的真实选题，为下周一到周五每天挑选 1 条最适合发布的选题，组成本周发布计划。`,
      rules: [
        "每天只输出 1 条选题。",
        "选题必须从选题池（availableTopics）中真实选取，output 字段用选题的 title。",
        "周一优先行业热点/经营判断类，周二优先产品选品指南类，周三优先痛点解决类，周四优先案例拆解类，周五优先节日借势/套餐建议类。",
        "如果某天没有完全匹配的选题，选最接近的替代，并在 reason 中说明。",
        "每条的 theme 必须用下面指定的标准格式。",
        "只输出 JSON，不要 Markdown。",
      ],
      dayThemes,
      availableTopics: weeklyPlanContext.topics,
      priorityTopics: weeklyPlanContext.priorityTopics,
      recentHotspots: weeklyPlanContext.hotspots,
      accountPositioning: weeklyPlanContext.positioning,
      outputSchema: {
        weeklyPlan: [
          {
            day: "周一",
            theme: "行业热点 / 经营判断",
            output: "从选题池选取的选题标题",
            topicId: "对应选题的 id",
            reason: "选取理由，50字以内",
          },
        ],
      },
    },
    null,
    2,
  );
}
