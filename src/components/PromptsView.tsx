import { Clipboard, History, RotateCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { adaptIndustryText } from "../industry";
import type { IndustryId, IndustryProfile, PromptFieldDefinition, PromptTemplate, Topic } from "../types";

const promptHistoryBaseKey = "haizong.prompts.history.v1";

type PromptHistoryItem = {
  id: string;
  promptId: string;
  promptPurpose: string;
  promptCategory: PromptTemplate["category"];
  selectedTopicId: string;
  selectedTopicTitle: string;
  fieldValues: Record<string, string>;
  generatedPrompt: string;
  generatedAt: string;
};

type Props = {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  prompts: PromptTemplate[];
  topics: Topic[];
};

function storageKeyForIndustry(baseKey: string, industryId: IndustryId) {
  return `${baseKey}.${industryId}`;
}

function buildIndustryValues(profile: IndustryProfile): Record<string, string> {
  return {
    accountPositioning: profile.name,
    accountAudience: profile.audience,
    accountPromise: profile.promise,
    accountStyle: profile.style,
    platforms: profile.platforms.join("、"),
    conversionGoal: profile.conversionGoal,
    industryLabel: profile.label,
    focusColumns: profile.columns.join("、"),
  };
}

function buildTopicValues(topic?: Topic | null): Record<string, string> {
  if (!topic) {
    return {};
  }

  return {
    title: topic.title,
    coreTopic: topic.title,
    query: topic.title,
    targetUser: topic.targetUser,
    painPoint: topic.painPoint,
    angle: topic.angle,
    businessLink: topic.businessLink,
    coreView: topic.coreView,
    platform: topic.platform,
    format: topic.format,
    column: topic.column,
    hotSource: topic.hotSource,
    review: topic.review,
    contentType: topic.contentType,
    performanceData: `播放 ${topic.publishData.views}，点赞 ${topic.publishData.likes}，收藏 ${topic.publishData.saves}，评论 ${topic.publishData.comments}，转化 ${topic.publishData.conversions}`,
  };
}

function buildFieldDefaults(template: PromptTemplate, topic: Topic | null, profile: IndustryProfile) {
  const topicValues = buildTopicValues(topic);
  const industryValues = buildIndustryValues(profile);

  return template.fields.reduce<Record<string, string>>((acc, field) => {
    if (field.source === "topic") {
      acc[field.key] = topicValues[field.key] ?? "";
      return acc;
    }

    if (field.source === "industry") {
      acc[field.key] = industryValues[field.key] ?? "";
      return acc;
    }

    acc[field.key] = "";
    return acc;
  }, {});
}

function renderPromptTemplate(template: string, values: Record<string, string>) {
  return template.replace(/{{\s*([\w-]+)\s*}}/g, (_, key: string) => values[key] ?? "");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN");
}

function readHistory(historyKey: string) {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const saved = window.localStorage.getItem(historyKey);
    if (!saved) {
      return [];
    }
    const parsed = JSON.parse(saved) as PromptHistoryItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(historyKey);
    return [];
  }
}

function writeHistory(historyKey: string, items: PromptHistoryItem[]) {
  window.localStorage.setItem(historyKey, JSON.stringify(items.slice(0, 5)));
}

function PromptField({
  field,
  value,
  onChange,
}: {
  field: PromptFieldDefinition;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`prompt-field prompt-field-${field.inputType}`}>
      <span>
        {field.label}
        {field.required ? <strong> *</strong> : null}
      </span>
      {field.inputType === "textarea" ? (
        <textarea
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          rows={4}
          value={value}
        />
      ) : (
        <input
          onChange={(event) => onChange(event.target.value)}
          placeholder={field.placeholder}
          type={field.inputType === "number" ? "number" : "text"}
          value={value}
        />
      )}
    </label>
  );
}

export function PromptsView({ activeIndustry, industryProfile, prompts, topics }: Props) {
  const historyKey = useMemo(() => storageKeyForIndustry(promptHistoryBaseKey, activeIndustry), [activeIndustry]);
  const visiblePrompts = useMemo(
    () => prompts.filter((prompt) => !prompt.industry || prompt.industry === activeIndustry),
    [activeIndustry, prompts],
  );
  const categories = useMemo(
    () => ["全部类型", ...Array.from(new Set(visiblePrompts.map((prompt) => prompt.category)))],
    [visiblePrompts],
  );
  const [categoryFilter, setCategoryFilter] = useState("全部类型");
  const [searchQuery, setSearchQuery] = useState("");
  const filteredPrompts = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return visiblePrompts.filter((prompt) => {
      const matchesCategory = categoryFilter === "全部类型" || prompt.category === categoryFilter;
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [prompt.purpose, prompt.summary, prompt.audience, prompt.category].join(" ").toLowerCase().includes(normalizedQuery);
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, searchQuery, visiblePrompts]);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [copiedPromptId, setCopiedPromptId] = useState("");
  const [copyError, setCopyError] = useState("");
  const [historyItems, setHistoryItems] = useState<PromptHistoryItem[]>([]);
  const skipHydrateRef = useRef(false);

  useEffect(() => {
    setHistoryItems(readHistory(historyKey));
  }, [historyKey]);

  useEffect(() => {
    if (!filteredPrompts.some((prompt) => prompt.id === selectedPromptId)) {
      setSelectedPromptId(filteredPrompts[0]?.id ?? "");
    }
  }, [filteredPrompts, selectedPromptId]);

  const selectedPrompt = useMemo(
    () => filteredPrompts.find((prompt) => prompt.id === selectedPromptId) ?? filteredPrompts[0] ?? null,
    [filteredPrompts, selectedPromptId],
  );
  const selectedTopic = useMemo(
    () => topics.find((topic) => topic.id === selectedTopicId) ?? null,
    [selectedTopicId, topics],
  );

  useEffect(() => {
    setCategoryFilter("全部类型");
    setSearchQuery("");
    setSelectedTopicId("");
  }, [activeIndustry]);

  useEffect(() => {
    if (!selectedPrompt) {
      setFieldValues({});
      return;
    }

    if (skipHydrateRef.current) {
      skipHydrateRef.current = false;
      return;
    }

    setFieldValues(buildFieldDefaults(selectedPrompt, selectedTopic, industryProfile));
    setCopyError("");
  }, [industryProfile, selectedPrompt, selectedTopic]);

  const missingFields = useMemo(() => {
    if (!selectedPrompt) {
      return [];
    }

    return selectedPrompt.fields
      .filter((field) => field.required && !String(fieldValues[field.key] ?? "").trim())
      .map((field) => field.label);
  }, [fieldValues, selectedPrompt]);

  const previewText = useMemo(() => {
    if (!selectedPrompt || missingFields.length > 0) {
      return "";
    }

    return renderPromptTemplate(adaptIndustryText(selectedPrompt.template, industryProfile), fieldValues).trim();
  }, [fieldValues, industryProfile, missingFields.length, selectedPrompt]);

  const updateField = (fieldKey: string, value: string) => {
    setFieldValues((current) => ({ ...current, [fieldKey]: value }));
  };

  const resetPrompt = () => {
    if (!selectedPrompt) {
      return;
    }
    setFieldValues(buildFieldDefaults(selectedPrompt, selectedTopic, industryProfile));
    setCopyError("");
  };

  const saveHistoryItem = (record: PromptHistoryItem) => {
    const nextItems = [record, ...historyItems.filter((item) => item.id !== record.id)].slice(0, 5);
    setHistoryItems(nextItems);
    writeHistory(historyKey, nextItems);
  };

  const copyPrompt = async () => {
    if (!selectedPrompt) {
      return;
    }

    if (missingFields.length > 0 || !previewText) {
      setCopyError(`请先补全必填项：${missingFields.join("、")}`);
      return;
    }

    const payload = `${previewText}\n\n输出字段：${selectedPrompt.outputFields.join("、")}`;

    try {
      await navigator.clipboard.writeText(payload);
    } catch {
      setCopyError("复制失败，请检查浏览器是否允许剪贴板访问。");
      return;
    }

    setCopiedPromptId(selectedPrompt.id);
    setCopyError("");
    window.setTimeout(() => setCopiedPromptId(""), 1600);

    const record: PromptHistoryItem = {
      id: `${selectedPrompt.id}-${Date.now()}`,
      promptId: selectedPrompt.id,
      promptPurpose: selectedPrompt.purpose,
      promptCategory: selectedPrompt.category,
      selectedTopicId,
      selectedTopicTitle: selectedTopic?.title ?? "未带入选题",
      fieldValues,
      generatedPrompt: payload,
      generatedAt: new Date().toISOString(),
    };
    saveHistoryItem(record);
  };

  const restoreHistoryItem = (record: PromptHistoryItem) => {
    skipHydrateRef.current = true;
    setSelectedPromptId(record.promptId);
    setSelectedTopicId(topics.some((topic) => topic.id === record.selectedTopicId) ? record.selectedTopicId : "");
    setFieldValues(record.fieldValues);
    setCopyError("");
  };

  return (
    <section className="prompts-workbench">
      <aside className="panel prompt-catalog">
        <div className="section-heading">
          <div>
            <h2>提示词模板</h2>
            <span>先选模板，再带入选题和行业信息生成可直接使用的 Prompt。</span>
          </div>
        </div>
        <label className="search-box prompt-search-field">
          <Search size={16} aria-hidden="true" />
          <input
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索用途、对象或关键词"
            type="search"
            value={searchQuery}
          />
        </label>
        <div className="prompt-category-row">
          {categories.map((category) => (
            <button
              className={`chip-button ${categoryFilter === category ? "active" : ""}`}
              key={category}
              onClick={() => setCategoryFilter(category)}
              type="button"
            >
              {category}
            </button>
          ))}
        </div>
        <div className="prompt-template-list">
          {filteredPrompts.length === 0 ? <p className="empty-text">当前筛选条件下没有匹配模板。</p> : null}
          {filteredPrompts.map((prompt) => (
            <button
              className={`prompt-template-option ${selectedPrompt?.id === prompt.id ? "active" : ""}`}
              key={prompt.id}
              onClick={() => setSelectedPromptId(prompt.id)}
              type="button"
            >
              <div className="prompt-template-meta">
                <span className="chip subtle-chip">{prompt.category}</span>
                <span>适用对象：{adaptIndustryText(prompt.audience, industryProfile)}</span>
              </div>
              <h3>{adaptIndustryText(prompt.purpose, industryProfile)}</h3>
              <p>{adaptIndustryText(prompt.summary, industryProfile)}</p>
              <div className="chip-row">
                {prompt.outputFields.map((field) => (
                  <span className="chip" key={field}>
                    {field}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>
      </aside>

      <section className="prompts-builder">
        <article className="panel prompt-builder-panel">
          {selectedPrompt ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>{adaptIndustryText(selectedPrompt.purpose, industryProfile)}</h2>
                  <span>{adaptIndustryText(selectedPrompt.summary, industryProfile)}</span>
                </div>
                <div className="prompt-builder-actions">
                  <button className="icon-button" onClick={resetPrompt} title="恢复默认字段" type="button">
                    <RotateCcw size={16} aria-hidden="true" />
                    <span>重置</span>
                  </button>
                  <button className="icon-button" onClick={copyPrompt} title="复制当前 Prompt" type="button">
                    <Clipboard size={16} aria-hidden="true" />
                    <span>{copiedPromptId === selectedPrompt.id ? "已复制" : "复制 Prompt"}</span>
                  </button>
                </div>
              </div>

              <div className="prompt-builder-grid">
                <div className="prompt-form-column">
                  <label className="prompt-field">
                    <span>带入当前行业选题</span>
                    <select onChange={(event) => setSelectedTopicId(event.target.value)} value={selectedTopicId}>
                      <option value="">不带入选题，手动填写</option>
                      {topics.map((topic) => (
                        <option key={topic.id} value={topic.id}>
                          {topic.title}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="prompt-field-grid">
                    {selectedPrompt.fields.map((field) => (
                      <PromptField
                        field={field}
                        key={field.key}
                        onChange={(value) => updateField(field.key, value)}
                        value={fieldValues[field.key] ?? ""}
                      />
                    ))}
                  </div>
                </div>

                <div className="prompt-preview-column">
                  <div className="prompt-preview-head">
                    <span className="eyebrow">实时预览</span>
                    <div className="chip-row">
                      {selectedPrompt.outputFields.map((field) => (
                        <span className="chip" key={field}>
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>

                  {missingFields.length > 0 ? (
                    <div className="prompt-preview-empty">
                      <h3>还不能生成完整 Prompt</h3>
                      <p>请先补全必填字段：{missingFields.join("、")}</p>
                    </div>
                  ) : (
                    <pre className="prompt-preview-text">{previewText}</pre>
                  )}

                  {copyError ? <p className="form-error">{copyError}</p> : null}
                </div>
              </div>
            </>
          ) : (
            <div className="empty-result">
              <h2>先选择一个提示词模板</h2>
              <p>模板会按当前行业筛选，选中后即可带入选题和行业信息生成 Prompt。</p>
            </div>
          )}
        </article>

        <article className="panel prompt-history-panel">
          <div className="section-heading">
            <div>
              <h2>最近使用</h2>
              <span>按行业分开保存最近 5 条，点击可恢复到当前编辑区。</span>
            </div>
            <History size={18} aria-hidden="true" />
          </div>
          <div className="prompt-history-list">
            {historyItems.length === 0 ? <p className="empty-text">当前行业还没有最近使用记录。</p> : null}
            {historyItems.map((item) => (
              <button className="prompt-history-item" key={item.id} onClick={() => restoreHistoryItem(item)} type="button">
                <div className="prompt-history-meta">
                  <span className="chip subtle-chip">{item.promptCategory}</span>
                  <span>{formatTime(item.generatedAt)}</span>
                </div>
                <strong>{adaptIndustryText(item.promptPurpose, industryProfile)}</strong>
                <p>带入选题：{item.selectedTopicTitle}</p>
              </button>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

export default PromptsView;
