import { requireEnv } from "../config.mjs";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";

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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
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
