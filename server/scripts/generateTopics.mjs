/**
 * 调用三源调研管线（抖音 + Tavily + DeepSeek）批量生成选题并确认入池。
 *
 * 用法：node server/scripts/generateTopics.mjs
 * 运行前确保 .env.local 中配置了 TAVILY_API_KEY、DEEPSEEK_API_KEY、JUSTONEAPI_TOKEN。
 */

import { loadEnvFiles } from "../config.mjs";
import { generateCandidates, confirmTopic, getTopicCategories } from "../services/topicCandidates.mjs";

// 必须在导入服务模块前加载环境变量（服务模块顶层有 requireEnv 调用）
loadEnvFiles(process.env.NODE_ENV || "development");

const BATCH_CONFIG = {
  industry: "hotpot",
  targetUser: "火锅店老板",
  column: "火锅食材选品指南",
  freshness: "oneMonth",
  notes: "批量生成脚本：基于抖音热门视频 + Tavily 网页搜索 + DeepSeek 分析，生成火锅行业选题。",
};

async function main() {
  const categories = ["行业热点选题", "产品种草选题", "B端经营选题"];
  const allConfirmed = [];

  for (const category of categories) {
    const queryMap = {
      行业热点选题: "火锅供应链 食材趋势 2025",
      产品种草选题: "火锅食材 爆品 采购",
      B端经营选题: "火锅店 经营 成本 毛利",
    };

    console.log(`\n=== 开始生成【${category}】候选选题 ===`);

    try {
      const result = await generateCandidates({
        industry: BATCH_CONFIG.industry,
        category,
        query: queryMap[category] || "火锅食材 供应链",
        targetUser: BATCH_CONFIG.targetUser,
        column: BATCH_CONFIG.column,
        freshness: BATCH_CONFIG.freshness,
        notes: BATCH_CONFIG.notes,
        limit: 3,
      });

      console.log(`  搜索来源: ${result.sources.length} 条网页`);
      console.log(`  候选数量: ${result.candidates.length} 条`);
      if (result.warning) console.log(`  ⚠️ 警告: ${result.warning}`);

      for (const candidate of result.candidates) {
        console.log(`\n  📋 候选: ${candidate.title}`);
        console.log(`     来源: ${candidate.hotSource}`);
        console.log(`     分数: ${candidate.recommendationScore}`);
        console.log(`     引用: ${candidate.sourceUrls.length} 条URL`);

        // 确认入池
        try {
          const confirmed = confirmTopic(candidate);
          allConfirmed.push(confirmed);
          console.log(`     ✅ 已入池: ${confirmed.id}`);
        } catch (err) {
          console.log(`     ❌ 入池失败: ${err.message}`);
        }
      }
    } catch (err) {
      console.error(`  ❌ 生成失败: ${err.message}`);
    }
  }

  console.log(`\n=== 完成 ===`);
  console.log(`共确认入池: ${allConfirmed.length} 条选题`);
  allConfirmed.forEach((t) => {
    console.log(`  ${t.id} | ${t.title} | ${t.hotSource}`);
  });
}

main().catch((err) => {
  console.error("脚本执行失败:", err);
  process.exit(1);
});
