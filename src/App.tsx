import {
  BarChart3,
  BookOpenText,
  Boxes,
  CheckCircle2,
  Clipboard,
  Clapperboard,
  ExternalLink,
  FileText,
  Globe2,
  LayoutDashboard,
  Library,
  Loader2,
  Save,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import PromptsView from "./components/PromptsView";
import data from "./data/content.json";
import { activeIndustryStorageKey, adaptIndustryText, defaultIndustryId, getIndustryProfile, normalizeIndustryId } from "./industry";
import type {
  IndustryId,
  IndustryProfile,
  HotspotOpportunity,
  ContentProduction,
  IterationSuggestion,
  MaterialImage,
  MaterialSection,
  PriorityTopic,
  PromptTemplate,
  GeneratedTopicCandidate,
  ResearchFreshness,
  ResearchRequest,
  ResearchResult,
  ResearchSource,
  ScriptStatus,
  Topic,
  TopicCandidateGenerateRequest,
  TopicCandidateGenerateResult,
  TopicCategory,
  TopicRefreshRequest,
  ProductionStep,
  ReviewRecord,
  ScriptTemplate,
} from "./types";

type ViewId = "dashboard" | "topics" | "production" | "research" | "scripts" | "prompts" | "materials" | "reviews" | "accounts";

const navItems: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard; adminOnly?: boolean }> = [
  { id: "dashboard", label: "首页概览", icon: LayoutDashboard },
  { id: "topics", label: "选题池", icon: Library },
  { id: "production", label: "内容生产台", icon: Clapperboard },
  { id: "research", label: "联网调研", icon: Globe2 },
  { id: "scripts", label: "脚本模板", icon: FileText },
  { id: "prompts", label: "提示词库", icon: Sparkles },
  { id: "materials", label: "素材库", icon: Boxes },
  { id: "reviews", label: "发布复盘", icon: BarChart3 },
  { id: "accounts", label: "账号管理", icon: Clipboard, adminOnly: true },
];

const viewDescriptions: Record<ViewId, string> = {
  dashboard: "聚焦今日优先事项、关键指标和本周内容节奏。",
  topics: "统一管理选题、筛选来源，并把候选方向推进到生产流程。",
  production: "围绕单个选题完成调研、脚本、素材、发布和复盘。",
  research: "结合实时搜索结果，为 B 端内容判断提供引用依据。",
  scripts: "沉淀可复用的脚本结构，减少重复搭建内容框架的时间。",
  prompts: "统一维护提示词资产，方便复制和迭代。",
  materials: "管理产品、案例和拍摄素材，支撑内容生产效率。",
  reviews: "回看发布数据与结论，把表现反馈进下一轮选题。",
  accounts: "管理员查看账号状态，并删除不再使用的账号。",
};

const statusOrder: ScriptStatus[] = ["未写", "已写", "已拍", "已发"];
const topicCategories = data.topicCategories as TopicCategory[];
const sourceFilterOptions = ["行业热点", "节日节气", "用户痛点", "产品卖点", "B端经营", "供应链趋势", "系列延展"] as const;
const contentStatusOptions = ["待撰写", "已撰写", "待优化", "已发布"] as const;
type SourceFilter = "全部来源" | (typeof sourceFilterOptions)[number];
type ContentStatusFilter = "全部状态" | (typeof contentStatusOptions)[number];
const productionSteps: Array<{ id: ProductionStep; label: string; description: string }> = [
  { id: "topic", label: "选题信息", description: "标题、栏目、来源、状态、观点、用户" },
  { id: "research", label: "调研依据", description: "行业热点、节气节点、痛点、卖点" },
  { id: "template", label: "脚本模板", description: "选择内容结构" },
  { id: "script", label: "脚本生成", description: "开头、正文、结尾、口播" },
  { id: "materials", label: "素材匹配", description: "产品图、场景、食材、封面" },
  { id: "publish", label: "发布内容", description: "标题、简介、标签、平台文案" },
  { id: "review", label: "发布复盘", description: "数据、线索、优化建议" },
];
const researchHistoryKey = "haizong.research.history.v1";
const dashboardAiKey = "haizong.dashboard.ai.v1";
const productionTopicIdsKey = "haizong.production.topic-ids.v1";
const freshnessOptions: Array<{ value: ResearchFreshness; label: string }> = [
  { value: "noLimit", label: "不限时间" },
  { value: "oneDay", label: "近一天" },
  { value: "oneWeek", label: "近一周" },
  { value: "oneMonth", label: "近一月" },
  { value: "oneYear", label: "近一年" },
];

const emptyProduction = (topicId: string, industry: IndustryId = defaultTopicIndustry): ContentProduction => ({
  topicId,
  industry,
  currentStep: "topic",
  researchNotes: "",
  selectedTemplateId: "",
  scriptDraft: { opener: "", structure: "", ending: "", voiceover: "" },
  matchedMaterials: { productImages: [], storeScenes: [], foodShots: [], coverReferences: [] },
  publishDraft: { title: "", description: "", hashtags: [], platformCopies: [] },
  reviewDraft: {
    publishDate: "",
    platform: "",
    views: 0,
    likes: 0,
    comments: 0,
    saves: 0,
    shares: 0,
    leads: 0,
    optimization: "",
  },
  updatedAt: "",
});

const formatNumber = (value: number) => new Intl.NumberFormat("zh-CN").format(value);
const formatDateTime = (value: string) => {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("zh-CN");
};
const getAccountStatusLabel = (status: AuthUser["status"]) => {
  if (status === "disabled") {
    return "已禁用";
  }
  if (status === "deleted") {
    return "已删除";
  }
  return "正常";
};

const industryProfiles = data.industryProfiles as IndustryProfile[];
const defaultProfile = industryProfiles[0] ?? null;
const defaultTopicIndustry = defaultProfile?.id ?? defaultIndustryId;
function getColumnLabel(columnValue: string) {
  if (columnValue.includes("选品指南")) {
    return "选品指南";
  }
  if (columnValue.includes("爆品打造")) {
    return "爆品打造";
  }
  if (columnValue.includes("成本控制")) {
    return "成本控制";
  }
  if (columnValue.includes("节日节气备货建议")) {
    return "节气备货";
  }
  if (columnValue.includes("避坑指南")) {
    return "老板避坑";
  }
  if (columnValue.includes("供应链知识")) {
    return "供应链知识";
  }
  return columnValue;
}

function getSourceLabel(topic: Topic): SourceFilter {
  if (topic.topicCategory === "系列化选题") {
    return "系列延展";
  }

  if (topic.column === "食材供应链知识" || /供应链|标准化|连锁|配送/.test(topic.hotSource + topic.angle + topic.coreView)) {
    return "供应链趋势";
  }

  if (topic.topicCategory === "节气节日选题") {
    return "节日节气";
  }

  if (topic.topicCategory === "用户痛点选题") {
    return "用户痛点";
  }

  if (topic.topicCategory === "产品种草选题" || topic.topicCategory === "爆品打造选题") {
    return "产品卖点";
  }

  if (topic.topicCategory === "B端经营选题") {
    return "B端经营";
  }

  return "行业热点";
}

function getTopicIndustry(topic: Topic): IndustryId {
  return normalizeIndustryId(topic.industry, defaultTopicIndustry);
}

function getReviewIndustry(review: ReviewRecord): IndustryId {
  return normalizeIndustryId((review as ReviewRecord & { industry?: IndustryId }).industry, defaultTopicIndustry);
}

function buildDefaultTopicCandidateForm(profile: IndustryProfile): TopicCandidateGenerateRequest {
  return {
    industry: profile.id,
    category: profile.defaultTopicCandidate.category,
    query: profile.defaultTopicCandidate.query,
    targetUser: profile.defaultTopicCandidate.targetUser,
    column: profile.defaultTopicCandidate.column,
    freshness: "oneMonth",
    notes: "",
    limit: 5,
  };
}

function buildDefaultResearchForm(profile: IndustryProfile): ResearchRequest {
  return {
    industry: profile.id,
    mode: "general",
    query: profile.defaultResearch.query,
    targetUser: profile.defaultResearch.targetUser,
    column: profile.defaultResearch.column,
    freshness: "oneMonth",
    notes: "",
  };
}

function storageKeyForIndustry(baseKey: string, industryId: IndustryId) {
  return `${baseKey}.${industryId}`;
}

function getContentStatusLabel(topic: Topic): ContentStatusFilter {
  if (topic.scriptStatus === "已发") {
    return "已发布";
  }

  if (topic.review.includes("待")) {
    return "待优化";
  }

  if (topic.scriptStatus === "已写" || topic.scriptStatus === "已拍") {
    return "已撰写";
  }

  return "待撰写";
}

type PerformanceInsight = {
  label: string;
  topic: Topic;
  value: string;
  reason: string;
};

type DashboardAiState = {
  label: string;
  result: ResearchResult;
};

type AuthSession = {
  token: string;
  phone: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  status: "active" | "disabled" | "deleted";
  loginAt: string;
  expiresAt: string;
  authMode: "server";
};

type AuthUser = {
  id: string;
  phone: string;
  username: string;
  displayName: string;
  role: "admin" | "member";
  status: "active" | "disabled" | "deleted";
  createdAt: string;
  lastLoginAt: string;
  hasPassword: boolean;
};

type AgentChatResult = {
  answer: string;
  updatedAt: string;
};

type AppAuthApi = {
  getSession: () => AuthSession | null;
  logout: (options?: { redirect?: boolean; redirectTo?: string }) => void | Promise<void>;
};

declare global {
  interface Window {
    AppAuth?: AppAuthApi;
    __APP_VERSION__?: string;
  }
}

function App() {
  const defaultProductionTopicIdsByIndustry = useMemo(() => {
    const hotpotIds = (data.topics as Topic[])
      .filter((topic) => getTopicIndustry(topic) === "hotpot")
      .map((topic) => topic.id);
    const bbqIds = (data.topics as Topic[])
      .filter((topic) => getTopicIndustry(topic) === "bbq")
      .map((topic) => topic.id);

    return {
      hotpot: hotpotIds,
      bbq: bbqIds,
    };
  }, []);
  const [activeIndustry, setActiveIndustry] = useState<IndustryId>(() => {
    if (typeof window === "undefined") {
      return defaultTopicIndustry;
    }

    try {
      const saved = window.localStorage.getItem(activeIndustryStorageKey);
      return normalizeIndustryId(saved, defaultTopicIndustry);
    } catch {
      return defaultTopicIndustry;
    }
  });
  const activeIndustryProfile = useMemo(
    () => getIndustryProfile(industryProfiles, activeIndustry) ?? defaultProfile,
    [activeIndustry],
  );
  const resolvedIndustryProfile = (activeIndustryProfile ?? industryProfiles[0]) as IndustryProfile;
  const [activeView, setActiveView] = useState<ViewId>("dashboard");
  const [query, setQuery] = useState("");
  const [column, setColumn] = useState("全部栏目");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("全部来源");
  const [contentStatus, setContentStatus] = useState<ContentStatusFilter>("全部状态");
  const [selectedTopicId, setSelectedTopicId] = useState("");
  const [productionTopicId, setProductionTopicId] = useState("");
  const [productionTopicIdsByIndustry, setProductionTopicIdsByIndustry] = useState<Record<IndustryId, string[]>>(() => {
    if (typeof window === "undefined") {
      return defaultProductionTopicIdsByIndustry;
    }

    try {
      const saved = window.localStorage.getItem(productionTopicIdsKey);
      if (!saved) {
        return defaultProductionTopicIdsByIndustry;
      }

      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          hotpot: Array.isArray(parsed.hotpot) ? parsed.hotpot.map((item: unknown) => String(item)).filter(Boolean) : defaultProductionTopicIdsByIndustry.hotpot,
          bbq: Array.isArray(parsed.bbq) ? parsed.bbq.map((item: unknown) => String(item)).filter(Boolean) : defaultProductionTopicIdsByIndustry.bbq,
        };
      }
      return defaultProductionTopicIdsByIndustry;
    } catch {
      window.localStorage.removeItem(productionTopicIdsKey);
      return defaultProductionTopicIdsByIndustry;
    }
  });
  const [topics, setTopics] = useState<Topic[]>(() => data.topics as Topic[]);
  const [scriptTemplates, setScriptTemplates] = useState<ScriptTemplate[]>(() => data.scriptTemplates as ScriptTemplate[]);
  const [materials, setMaterials] = useState<Array<MaterialSection & { industry?: IndustryId }>>(
    () => data.materials as Array<MaterialSection & { industry?: IndustryId }>,
  );
  const [session, setSession] = useState<AuthSession | null>(() => window.AppAuth?.getSession() ?? null);
  const [agentQuestion, setAgentQuestion] = useState("");
  const [agentResult, setAgentResult] = useState<AgentChatResult | null>(null);
  const [agentError, setAgentError] = useState("");
  const [isAgentLoading, setIsAgentLoading] = useState(false);
  const [productions, setProductions] = useState<ContentProduction[]>(() =>
    Array.isArray((data as { productions?: ContentProduction[] }).productions)
      ? ((data as { productions: ContentProduction[] }).productions)
      : [],
  );
  const [reviews, setReviews] = useState<ReviewRecord[]>(() => data.reviews as ReviewRecord[]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(activeIndustryStorageKey, activeIndustry);
    }
  }, [activeIndustry]);

  useEffect(() => {
    setSelectedTopicId("");
  }, [activeIndustry]);

  const visibleTopics = useMemo(
    () => topics.filter((topic) => getTopicIndustry(topic) === activeIndustry),
    [activeIndustry, topics],
  );

  const filteredTopics = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return visibleTopics.filter((topic) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        [topic.title, topic.contentType, topic.targetUser, topic.painPoint, topic.angle, topic.coreView]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);
      const matchesColumn = column === "全部栏目" || topic.column === column;
      const matchesSource = sourceFilter === "全部来源" || getSourceLabel(topic) === sourceFilter;
      const matchesStatus = contentStatus === "全部状态" || getContentStatusLabel(topic) === contentStatus;
      return matchesQuery && matchesColumn && matchesSource && matchesStatus;
    });
  }, [column, contentStatus, query, sourceFilter, visibleTopics]);

  const selectedTopic = useMemo(() => {
    return filteredTopics.find((topic) => topic.id === selectedTopicId) ?? filteredTopics[0] ?? visibleTopics[0];
  }, [filteredTopics, selectedTopicId, visibleTopics]);

  const metrics = useMemo(() => {
    const totalViews = visibleTopics.reduce((sum, topic) => sum + topic.publishData.views, 0);
    const published = visibleTopics.filter((topic) => topic.scriptStatus === "已发").length;
    const needsReview = visibleTopics.filter(
      (topic) => topic.publishData.views > 0 && topic.review.includes("待"),
    ).length;
    const statusCounts = statusOrder.map((item) => ({
      label: item,
      count: visibleTopics.filter((topic) => topic.scriptStatus === item).length,
    }));
    const columnCounts = activeIndustryProfile.columns.map((item) => ({
      label: item,
      count: visibleTopics.filter((topic) => topic.column === item).length,
    }));
    return { totalViews, published, needsReview, statusCounts, columnCounts };
  }, [activeIndustryProfile.columns, visibleTopics]);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => !item.adminOnly || session?.role === "admin"),
    [session?.role],
  );

  useEffect(() => {
    const syncSession = () => {
      const nextSession = window.AppAuth?.getSession() ?? null;
      setSession(nextSession);

      if (!nextSession) {
        window.location.replace("/login.html");
      }
    };

    syncSession();
    window.addEventListener("storage", syncSession);
    window.addEventListener("auth:logout", syncSession);
    window.addEventListener("auth:login", syncSession);
    return () => {
      window.removeEventListener("storage", syncSession);
      window.removeEventListener("auth:logout", syncSession);
      window.removeEventListener("auth:login", syncSession);
    };
  }, []);

  useEffect(() => {
    setProductionTopicIdsByIndustry((current) => {
      const currentIds = current[activeIndustry] ?? [];
      const validTopicIds = new Set(visibleTopics.map((topic) => topic.id));
      const filtered = currentIds.filter((topicId) => validTopicIds.has(topicId));
      const nextIds = filtered.length > 0 ? filtered : defaultProductionTopicIdsByIndustry[activeIndustry].filter((topicId) => validTopicIds.has(topicId));
      if (filtered.length === currentIds.length && filtered.every((topicId, index) => topicId === currentIds[index])) {
        return current;
      }
      return { ...current, [activeIndustry]: nextIds };
    });
  }, [activeIndustry, defaultProductionTopicIdsByIndustry, visibleTopics]);

  useEffect(() => {
    if (activeView === "accounts" && session?.role !== "admin") {
      setActiveView("dashboard");
    }
  }, [activeView, session?.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(productionTopicIdsKey, JSON.stringify(productionTopicIdsByIndustry));
  }, [productionTopicIdsByIndustry]);

  useEffect(() => {
    const currentVisible = (productionTopicIdsByIndustry[activeIndustry] ?? []).filter((topicId) =>
      visibleTopics.some((topic) => topic.id === topicId),
    );
    if (currentVisible.length === 0) {
      if (productionTopicId) {
        setProductionTopicId("");
      }
      return;
    }
    if (!currentVisible.includes(productionTopicId)) {
      setProductionTopicId(currentVisible[0]);
    }
  }, [activeIndustry, productionTopicId, productionTopicIdsByIndustry, visibleTopics]);

  const ensureProductionTopicVisible = (topicId: string) => {
    setProductionTopicIdsByIndustry((current) => {
      const currentIds = current[activeIndustry] ?? [];
      return currentIds.includes(topicId)
        ? current
        : {
            ...current,
            [activeIndustry]: [...currentIds, topicId],
          };
    });
    setProductionTopicId(topicId);
  };

  const removeProductionTopic = (topicId: string) => {
    setProductionTopicIdsByIndustry((current) => {
      const currentIds = current[activeIndustry] ?? [];
      const index = currentIds.indexOf(topicId);
      if (index === -1) {
        return current;
      }

      const next = currentIds.filter((item) => item !== topicId);
      if (productionTopicId === topicId) {
        setProductionTopicId(next[Math.min(index, next.length - 1)] ?? "");
      }
      return {
        ...current,
        [activeIndustry]: next,
      };
    });
  };

  const askAgent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const question = agentQuestion.trim();
    if (!question || isAgentLoading) {
      return;
    }

    setIsAgentLoading(true);
    setAgentError("");

    try {
      const response = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          industry: activeIndustry,
          activeView,
        }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "AI 助手暂时无法回答");
      }

      setAgentResult({
        answer: String(payload.answer ?? ""),
        updatedAt: String(payload.updatedAt ?? new Date().toISOString()),
      });
    } catch (caught) {
      setAgentError(caught instanceof Error ? caught.message : "AI 助手暂时无法回答");
    } finally {
      setIsAgentLoading(false);
    }
  };

  const handleTopicDeleted = (topicId: string) => {
    setTopics((current) => current.filter((topic) => topic.id !== topicId));
    setProductions((current) => current.filter((production) => production.topicId !== topicId));
    setProductionTopicIdsByIndustry((current) => ({
      hotpot: (current.hotpot ?? []).filter((item) => item !== topicId),
      bbq: (current.bbq ?? []).filter((item) => item !== topicId),
    }));

    if (selectedTopicId === topicId) {
      setSelectedTopicId("");
    }

    if (productionTopicId === topicId) {
      setProductionTopicId("");
    }
  };

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="主导航">
        <div className="sidebar-brand-block">
          <div className="brand">
            <div className="brand-mark">海哥</div>
            <div>
              <strong>海哥自媒体账号内容工作台</strong>
              <span>{resolvedIndustryProfile.name}</span>
            </div>
          </div>
          <div className="industry-switcher" role="tablist" aria-label="行业切换">
            {industryProfiles.map((profile) => (
              <button
                className={`industry-switch ${activeIndustry === profile.id ? "active" : ""}`}
                key={profile.id}
                onClick={() => setActiveIndustry(profile.id)}
                role="tab"
                type="button"
              >
                {profile.label}
              </button>
            ))}
          </div>
        </div>
        <TopbarAgent
          answer={agentResult}
          error={agentError}
          isLoading={isAgentLoading}
          onQuestionChange={setAgentQuestion}
          onSubmit={askAgent}
          question={agentQuestion}
        />
        <div className="sidebar-nav-block">
          <nav className="nav-list nav-list-inline nav-list-sidebar" aria-label="页面切换">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  className={`nav-button ${activeView === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setActiveView(item.id)}
                  type="button"
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="nav-auth nav-auth-sidebar">
            <div className="nav-user">
              <strong>{session?.displayName ?? "已登录"}</strong>
              <span>{session?.phone ?? "未识别手机号"} · {session?.role === "admin" ? "管理员" : "成员"}</span>
            </div>
            <span className="version-badge">v{window.__APP_VERSION__ ?? "0.1.0"}</span>
            <button
              className="nav-button nav-logout-button"
              onClick={() => window.AppAuth?.logout()}
              type="button"
            >
              <span>退出登录</span>
            </button>
          </div>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{activeView === "scripts" ? (activeIndustry === "bbq" ? "烧烤食材供应链" : "火锅食材供应链") : resolvedIndustryProfile.dashboard.kicker}</p>
            <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
            <div className="topbar-note-inline">{viewDescriptions[activeView]}</div>
          </div>
        </header>

        {activeView === "dashboard" ? (
          <Dashboard
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            metrics={metrics}
            onTopicConfirmed={(topic) => {
              setTopics((current) => [topic, ...current]);
              setSelectedTopicId(topic.id);
            }}
            topics={visibleTopics}
            setActiveView={setActiveView}
          />
        ) : null}

        {activeView === "topics" ? (
          <TopicsView
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            column={column}
            filteredTopics={filteredTopics}
            onTopicConfirmed={(topic) => {
              setTopics((current) => [topic, ...current]);
              setSelectedTopicId(topic.id);
            }}
            onStartProduction={(topicId) => {
              ensureProductionTopicVisible(topicId);
              setActiveView("production");
            }}
            onTopicDeleted={handleTopicDeleted}
            query={query}
            selectedTopic={selectedTopic}
            setColumn={setColumn}
            setContentStatus={setContentStatus}
            setQuery={setQuery}
            setSelectedTopicId={setSelectedTopicId}
            setSourceFilter={setSourceFilter}
            contentStatus={contentStatus}
            sourceFilter={sourceFilter}
          />
        ) : null}

        {activeView === "production" ? (
          <ProductionView
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            onScriptTemplateSaved={(template) => setScriptTemplates((current) => [...current, template])}
            onProductionSaved={(production, review, topic) => {
              setProductions((current) => {
                const existingIndex = current.findIndex((item) => item.topicId === production.topicId);
                if (existingIndex === -1) {
                  return [...current, production];
                }
                return current.map((item) => (item.topicId === production.topicId ? production : item));
              });
              if (topic) {
                setTopics((current) => current.map((item) => (item.id === topic.id ? topic : item)));
              }
              if (review) {
                setReviews((current) => {
                  const existingIndex = current.findIndex((item) => item.id === review.id);
                  if (existingIndex === -1) {
                    return [...current, review];
                  }
                  return current.map((item) => (item.id === review.id ? review : item));
                });
              }
            }}
            productionTopicId={productionTopicId}
            productionTopicIds={productionTopicIdsByIndustry[activeIndustry] ?? []}
            productions={productions}
            removeProductionTopic={removeProductionTopic}
            scriptTemplates={scriptTemplates}
            setProductionTopicId={setProductionTopicId}
            topics={topics}
          />
        ) : null}

        {activeView === "research" ? <ResearchView activeIndustry={activeIndustry} industryProfile={resolvedIndustryProfile} /> : null}
        {activeView === "scripts" ? (
          <ScriptsView
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            onScriptTemplateDeleted={(templateId) =>
              setScriptTemplates((current) => current.filter((template) => template.id !== templateId))
            }
            scriptTemplates={scriptTemplates}
            setActiveIndustry={setActiveIndustry}
          />
        ) : null}
        {activeView === "prompts" ? (
          <PromptsView
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            prompts={data.prompts as PromptTemplate[]}
            topics={visibleTopics}
          />
        ) : null}
        {activeView === "materials" ? (
          <MaterialsView
            activeIndustry={activeIndustry}
            industryProfile={resolvedIndustryProfile}
            materials={materials}
            setMaterials={setMaterials}
          />
        ) : null}
        {activeView === "reviews" ? <ReviewsView activeIndustry={activeIndustry} industryProfile={resolvedIndustryProfile} reviews={reviews} /> : null}
        {activeView === "accounts" && session?.role === "admin" ? <AccountsView session={session} /> : null}
      </main>
    </div>
  );
}

function TopbarAgent({
  answer,
  error,
  isLoading,
  onQuestionChange,
  onSubmit,
  question,
}: {
  answer: AgentChatResult | null;
  error: string;
  isLoading: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  question: string;
}) {
  const [isAnswerCollapsed, setIsAnswerCollapsed] = useState(false);

  useEffect(() => {
    setIsAnswerCollapsed(false);
  }, [answer?.answer, answer?.updatedAt]);

  return (
    <section className="topbar-agent" aria-label="AI 助手">
      <form className="topbar-agent-form" onSubmit={onSubmit}>
        <div className="agent-logo-slot" aria-label="AI 助手 Logo 预留位">
          <Sparkles size={16} aria-hidden="true" />
        </div>
        <input
          maxLength={600}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder="问 AI 助手：选题、脚本、素材、复盘..."
          value={question}
        />
        <button className="agent-send-button" disabled={!question.trim() || isLoading} type="submit" title="发送问题">
          {isLoading ? <Loader2 className="spin-icon" size={16} aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
        </button>
      </form>

      {error ? <div className="topbar-agent-message error">{error}</div> : null}
      {answer?.answer ? (
        <div className={`topbar-agent-answer ${isAnswerCollapsed ? "collapsed" : ""}`}>
          <div className="topbar-agent-answer-head">
            <span>AI 助手</span>
            <time>{formatDateTime(answer.updatedAt)}</time>
          </div>
          {isAnswerCollapsed ? null : <p>{answer.answer}</p>}
          <button
            className="agent-answer-toggle"
            onClick={() => setIsAnswerCollapsed((current) => !current)}
            type="button"
          >
            {isAnswerCollapsed ? "展开" : "收起"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function AccountsView({ session }: { session: AuthSession }) {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingUserId, setUpdatingUserId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    phone: "",
    displayName: "",
    password: "",
    role: "member" as AuthUser["role"],
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadUsers = async () => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/users", {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "账号列表加载失败");
      }

      setUsers(Array.isArray(payload.users) ? (payload.users as AuthUser[]) : []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号列表加载失败");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, [session.token]);

  const updateUser = async (user: AuthUser, endpoint: string, body: Record<string, string>, successMessage: string) => {
    setUpdatingUserId(user.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id, ...body }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "账号更新失败");
      }

      setUsers((current) => current.map((item) => (item.id === user.id ? (payload.user as AuthUser) : item)));
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号更新失败");
    } finally {
      setUpdatingUserId("");
    }
  };

  const deleteUser = async (user: AuthUser) => {
    const confirmed = window.confirm(`确定删除账号 ${user.phone} 吗？删除后该手机号不能再登录。`);
    if (!confirmed) {
      return;
    }

    setUpdatingUserId(user.id);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/users/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ userId: user.id }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "账号删除失败");
      }

      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage(`账号 ${user.phone} 已删除`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号删除失败");
    } finally {
      setUpdatingUserId("");
    }
  };

  const updateStatus = (user: AuthUser, status: "active" | "disabled") => {
    const label = status === "active" ? "启用" : "禁用";
    updateUser(user, "/api/auth/users/status", { status }, `账号 ${user.phone} 已${label}`);
  };

  const updateRole = (user: AuthUser, role: "admin" | "member") => {
    const label = role === "admin" ? "管理员" : "成员";
    updateUser(user, "/api/auth/users/role", { role }, `账号 ${user.phone} 已设为${label}`);
  };

  const createUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsCreating(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/auth/users/create", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(createForm),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "账号创建失败");
      }

      setUsers((current) => [...current, payload.user as AuthUser]);
      setCreateForm({ phone: "", displayName: "", password: "", role: "member" });
      setMessage(`账号 ${(payload.user as AuthUser).phone} 已创建`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "账号创建失败");
    } finally {
      setIsCreating(false);
    }
  };

  const resetPassword = async (user: AuthUser) => {
    const password = window.prompt(`请输入账号 ${user.phone} 的新密码，至少 8 位。`);
    if (password === null) {
      return;
    }
    await updateUser(user, "/api/auth/users/password", { password }, `账号 ${user.phone} 的密码已重置`);
  };

  return (
    <section className="panel account-panel">
      <div className="section-heading">
        <div>
          <h2>账号管理</h2>
          <span>管理员可查看账号状态，调整角色，并禁用或删除不再使用的账号</span>
        </div>
        <button className="icon-button" disabled={isLoading} onClick={loadUsers} type="button">
          {isLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
          <span>{isLoading ? "加载中" : "刷新"}</span>
        </button>
      </div>

      {error ? <div className="research-error">{error}</div> : null}
      {message ? <div className="topic-confirm-message">{message}</div> : null}

      <form className="account-create-form" onSubmit={createUser}>
        <label>
          <span>手机号</span>
          <input
            inputMode="numeric"
            onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
            placeholder="11 位手机号"
            value={createForm.phone}
          />
        </label>
        <label>
          <span>昵称</span>
          <input
            onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
            placeholder="可选"
            value={createForm.displayName}
          />
        </label>
        <label>
          <span>初始密码</span>
          <input
            minLength={8}
            onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
            placeholder="至少 8 位"
            type="password"
            value={createForm.password}
          />
        </label>
        <label>
          <span>角色</span>
          <select onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value as AuthUser["role"] }))} value={createForm.role}>
            <option value="member">成员</option>
            <option value="admin">管理员</option>
          </select>
        </label>
        <button className="icon-button" disabled={isCreating} type="submit">
          {isCreating ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          <span>{isCreating ? "创建中" : "创建账号"}</span>
        </button>
      </form>

      <div className="table-scroll">
        <table className="account-table">
          <thead>
            <tr>
              <th>手机号</th>
              <th>昵称</th>
              <th>角色</th>
              <th>状态</th>
              <th>密码</th>
              <th>创建时间</th>
              <th>最近登录</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isSelf = user.phone === session.phone;
              const isDeleted = user.status === "deleted";
              const isUpdating = updatingUserId === user.id;
              const canChangeRole = !isSelf && !isDeleted;
              const canDisable = !isSelf && user.status === "active";
              const canEnable = !isSelf && user.status === "disabled";
              const canDelete = !isSelf && user.status !== "deleted";
              return (
                <tr key={user.id}>
                  <td>{user.phone}</td>
                  <td>{user.displayName}</td>
                  <td>{user.role === "admin" ? "管理员" : "成员"}</td>
                  <td>{getAccountStatusLabel(user.status)}</td>
                  <td>{user.hasPassword ? "已设置" : "未设置"}</td>
                  <td>{formatDateTime(user.createdAt)}</td>
                  <td>{formatDateTime(user.lastLoginAt)}</td>
                  <td>
                    <div className="account-action-row">
                      {canEnable ? (
                        <button className="icon-button account-delete-button" disabled={isUpdating} onClick={() => updateStatus(user, "active")} type="button">
                          {isUpdating ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                          <span>启用</span>
                        </button>
                      ) : (
                        <button className="icon-button account-delete-button" disabled={!canDisable || isUpdating} onClick={() => updateStatus(user, "disabled")} type="button">
                          {isUpdating ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                          <span>禁用</span>
                        </button>
                      )}
                      <button
                        className="icon-button secondary account-delete-button"
                        disabled={!canChangeRole || isUpdating}
                        onClick={() => updateRole(user, user.role === "admin" ? "member" : "admin")}
                        type="button"
                      >
                        <Clipboard size={14} aria-hidden="true" />
                        <span>{user.role === "admin" ? "设为成员" : "设为管理员"}</span>
                      </button>
                      <button
                        className="icon-button secondary account-delete-button"
                        disabled={isDeleted || isUpdating}
                        onClick={() => resetPassword(user)}
                        type="button"
                      >
                        <Clipboard size={14} aria-hidden="true" />
                        <span>重置密码</span>
                      </button>
                      <button
                        className="icon-button danger account-delete-button"
                        disabled={!canDelete || isUpdating}
                        onClick={() => deleteUser(user)}
                        type="button"
                      >
                        {isUpdating ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                        <span>{isUpdating ? "处理中" : "删除"}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isLoading && users.length === 0 ? <p className="empty-text">暂无账号记录。</p> : null}
    </section>
  );
}

function Dashboard({
  activeIndustry,
  industryProfile,
  metrics,
  onTopicConfirmed,
  topics,
  setActiveView,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  metrics: {
    totalViews: number;
    published: number;
    needsReview: number;
    statusCounts: Array<{ label: string; count: number }>;
    columnCounts: Array<{ label: string; count: number }>;
  };
  onTopicConfirmed: (topic: Topic) => void;
  topics: Topic[];
  setActiveView: (view: ViewId) => void;
}) {
  const hotspots = data.hotspots as HotspotOpportunity[];
  const suggestions = data.iterationSuggestions as IterationSuggestion[];
  const priorityTopics = data.priorityTopics as PriorityTopic[];
  const [dashboardFocus, setDashboardFocus] = useState(industryProfile.dashboard.heroTitle);
  const [dashboardAi, setDashboardAi] = useState<DashboardAiState | null>(null);
  const [dashboardAiError, setDashboardAiError] = useState("");
  const [dashboardAiLoading, setDashboardAiLoading] = useState("");
  const [dashboardRefreshLoading, setDashboardRefreshLoading] = useState(false);
  const [dashboardRefreshMessage, setDashboardRefreshMessage] = useState("");
  const [dashboardRefreshSources, setDashboardRefreshSources] = useState<ResearchSource[]>([]);
  const [confirmHeroLoading, setConfirmHeroLoading] = useState(false);
  const [heroTopic, setHeroTopic] = useState(industryProfile.dashboard.heroTopic);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(industryProfile.dashboard.lastRefreshedAt ?? "");
  const [weeklyPlanLoading, setWeeklyPlanLoading] = useState(false);
  const [weeklyPlan, setWeeklyPlan] = useState(industryProfile.dashboard.weeklyPlan);
  const dashboardStorageKey = storageKeyForIndustry(dashboardAiKey, activeIndustry);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(dashboardStorageKey);
      if (saved) {
        setDashboardAi(JSON.parse(saved) as DashboardAiState);
      }
    } catch {
      window.localStorage.removeItem(dashboardStorageKey);
    }
  }, [dashboardStorageKey]);

  useEffect(() => {
    setDashboardFocus(industryProfile.dashboard.heroTitle);
    setHeroTopic(industryProfile.dashboard.heroTopic);
    setWeeklyPlan(industryProfile.dashboard.weeklyPlan);
    setLastRefreshedAt(industryProfile.dashboard.lastRefreshedAt ?? "");
    setDashboardRefreshMessage("");
    setDashboardRefreshSources([]);
  }, [industryProfile]);

  const runDashboardAi = async (label: string, request: ResearchRequest) => {
    setDashboardAiLoading(label);
    setDashboardAiError("");

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "AI 请求失败");
      }

      const nextState = { label, result: payload as ResearchResult };
      setDashboardAi(nextState);
      window.localStorage.setItem(dashboardStorageKey, JSON.stringify(nextState));
    } catch (caught) {
      setDashboardAiError(caught instanceof Error ? caught.message : "AI 请求失败");
    } finally {
      setDashboardAiLoading("");
    }
  };

  const requestTodayDecision = () => {
    runDashboardAi(`${industryProfile.label}AI 今日决策`, {
      industry: activeIndustry,
      mode: "dashboardDecision",
      query: dashboardFocus || "今日内容决策",
      targetUser: industryProfile.audience,
      column: "全部栏目",
      freshness: "oneMonth",
      notes: JSON.stringify({
        positioning: {
          ...data.positioning,
          name: industryProfile.name,
          audience: industryProfile.audience,
          promise: industryProfile.promise,
          style: industryProfile.style,
          conversionGoal: industryProfile.conversionGoal,
        },
        industryProfile,
        hotspots,
        priorityTopics,
        materials: data.materials,
      }),
    });
  };

  const handleRefreshWeeklyPlan = async () => {
    setWeeklyPlanLoading(true);
    try {
      const response = await fetch("/api/dashboard/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);
      if (!response.ok) throw new Error(payload.error ?? "周计划生成失败");
      // 用返回的最新数据更新本地状态
      if (Array.isArray(payload.weeklyPlan)) {
        setWeeklyPlan(payload.weeklyPlan);
      }
    } catch (caught) {
      setDashboardAiError(caught instanceof Error ? caught.message : "周计划生成失败");
    } finally {
      setWeeklyPlanLoading(false);
    }
  };

  const handleDailyRefresh = async () => {
    setDashboardRefreshLoading(true);
    setDashboardAiError("");
    setDashboardRefreshMessage("");

    try {
      const response = await fetch("/api/dashboard/daily-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "首页今日刷新失败");
      }

      if (payload.heroTopic) {
        setHeroTopic(payload.heroTopic);
      }
      if (Array.isArray(payload.weeklyPlan)) {
        setWeeklyPlan(payload.weeklyPlan);
      }
      if (payload.refreshedAt) {
        setLastRefreshedAt(payload.refreshedAt);
      }
      setDashboardRefreshSources(Array.isArray(payload.sources) ? payload.sources : []);
      setDashboardRefreshMessage(payload.warning ? `已刷新，提示：${payload.warning}` : "首页今日推荐和本周计划已刷新。");
    } catch (caught) {
      setDashboardAiError(caught instanceof Error ? caught.message : "首页今日刷新失败");
    } finally {
      setDashboardRefreshLoading(false);
    }
  };

  const confirmHeroTopic = async () => {
    const confirmed = window.confirm(`确认将《${heroTopic.title}》写入选题池吗？写入后可以在选题池继续编辑和进入生产。`);
    if (!confirmed) {
      return;
    }

    setConfirmHeroLoading(true);
    setDashboardAiError("");
    setDashboardRefreshMessage("");

    try {
      const response = await fetch("/api/topics/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          industry: activeIndustry,
          title: heroTopic.title,
          topicCategory: "行业热点选题",
          column: industryProfile.columns[0] ?? "食材供应链知识",
          targetUser: heroTopic.targetUser || industryProfile.audience,
          painPoint: heroTopic.contentType || "今日首页 AI 研判推荐方向",
          angle: heroTopic.contentType || "今日内容机会",
          coreView: heroTopic.title,
          businessLink: heroTopic.productAssociation || industryProfile.conversionGoal,
          hotSource: "首页每日刷新",
          platform: heroTopic.platform || industryProfile.platforms.join("/"),
          format: "口播/图文",
          sourceUrls: dashboardRefreshSources.map((source) => source.url).filter(Boolean).slice(0, 4),
          recommendationScore: 78,
          risks: ["首页推荐为 AI 联网研判结果，入池后仍需人工补充资料和审核表达。"],
        }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "确认入选题池失败");
      }

      const topic = payload as Topic;
      onTopicConfirmed(topic);
      setDashboardRefreshMessage(`已确认入池：${topic.title}`);
    } catch (caught) {
      setDashboardAiError(caught instanceof Error ? caught.message : "确认入选题池失败");
    } finally {
      setConfirmHeroLoading(false);
    }
  };

  const publishedTopics = topics.filter((topic) => topic.publishData.views > 0);
  const averageViews =
    publishedTopics.length > 0
      ? Math.round(publishedTopics.reduce((sum, topic) => sum + topic.publishData.views, 0) / publishedTopics.length)
      : 0;
  const averageConversions =
    publishedTopics.length > 0
      ? Math.round(
          publishedTopics.reduce((sum, topic) => sum + topic.publishData.conversions, 0) / publishedTopics.length,
        )
      : 0;
  const topViews = [...publishedTopics].sort((a, b) => b.publishData.views - a.publishData.views)[0];
  const topSaves = [...publishedTopics].sort((a, b) => {
    const aRate = a.publishData.views > 0 ? a.publishData.saves / a.publishData.views : 0;
    const bRate = b.publishData.views > 0 ? b.publishData.saves / b.publishData.views : 0;
    return bRate - aRate;
  })[0];
  const topConversions = [...publishedTopics].sort((a, b) => b.publishData.conversions - a.publishData.conversions)[0];
  const seriesCandidate =
    publishedTopics.find((topic) => /系列|继续|扩展|清单|模板/.test(topic.review + topic.title + topic.column)) ??
    publishedTopics[0];
  const insights: PerformanceInsight[] = [
    topViews
      ? {
          label: "高播放",
          topic: topViews,
          value: formatNumber(topViews.publishData.views),
          reason: `高于已发布作品平均播放 ${formatNumber(averageViews)}，适合复用内容结构。`,
        }
      : null,
    topSaves
      ? {
          label: "高收藏",
          topic: topSaves,
          value: `${((topSaves.publishData.saves / topSaves.publishData.views) * 100).toFixed(1)}%`,
          reason: "收藏率靠前，适合沉淀成清单、模板或长图文。",
        }
      : null,
    topConversions
      ? {
          label: "高转化",
          topic: topConversions,
          value: `${topConversions.publishData.conversions}条`,
          reason: `转化高于平均 ${averageConversions} 条，应补充产品资料和转化话术。`,
        }
      : null,
    seriesCandidate
      ? {
          label: "可系列化",
          topic: seriesCandidate,
          value: seriesCandidate.contentType,
          reason: "复盘结论或内容形态具备延展信号，适合继续拆成多集。",
        }
      : null,
  ].filter(Boolean) as PerformanceInsight[];

  const reviewCards = [
    { title: "高互动内容", metric: topViews ? formatNumber(topViews.publishData.views) : "0", detail: topViews?.title ?? heroTopic.title },
    { title: "可二次改编内容", metric: "系列化", detail: seriesCandidate?.title ?? "菜单结构类内容适合拆成系列" },
    { title: "低表现内容", metric: "待优化", detail: "产品卖点不清时，先补门店场景和采购理由" },
    { title: "下周推荐方向", metric: "成本控制", detail: weeklyPlan[0]?.output ?? "围绕高复购食材、低损耗组合、节气备货继续推进" },
  ];
  const refreshDateLabel = lastRefreshedAt ? `最近刷新：${formatDateTime(lastRefreshedAt)}` : "今日推荐尚未刷新";
  const isRefreshedToday = lastRefreshedAt ? new Date(lastRefreshedAt).toDateString() === new Date().toDateString() : false;

  const applyQuickTopic = (topic: string) => {
    setDashboardFocus(topic);
    runDashboardAi(`${industryProfile.label} AI 今日决策：${topic}`, {
      industry: activeIndustry,
      mode: "dashboardDecision",
      query: topic,
      targetUser: industryProfile.audience,
      column: "全部栏目",
      freshness: "oneMonth",
      notes: JSON.stringify({
        positioning: {
          ...data.positioning,
          name: industryProfile.name,
          audience: industryProfile.audience,
          promise: industryProfile.promise,
          style: industryProfile.style,
          conversionGoal: industryProfile.conversionGoal,
        },
        industryProfile,
        quickTopic: topic,
        hotspots,
        priorityTopics,
        materials: data.materials,
      }),
    });
  };

  return (
    <section className="command-dashboard">
      <section className="command-hero">
        <div className="command-hero-copy">
          <span className="command-kicker">{industryProfile.dashboard.kicker}</span>
          <h2>{industryProfile.dashboard.heroTitle}</h2>
          <p>{industryProfile.dashboard.heroDescription}</p>
          <div className="command-actions">
            <button className="command-button secondary" disabled={Boolean(dashboardAiLoading)} onClick={requestTodayDecision} type="button">
              {dashboardAiLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              <span>{dashboardAiLoading ? "生成中" : "生成今日选题"}</span>
            </button>
            <button className="command-button primary daily-refresh-button" disabled={dashboardRefreshLoading} onClick={handleDailyRefresh} type="button">
              {dashboardRefreshLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Globe2 size={18} aria-hidden="true" />}
              <span>{dashboardRefreshLoading ? "刷新中" : "今日刷新"}</span>
            </button>
            <button className="command-button secondary" onClick={() => setActiveView("topics")} type="button">
              查看选题池
            </button>
            <button className="command-button ghost" onClick={() => setActiveView("production")} type="button">
              创建脚本
            </button>
          </div>
          <p className="dashboard-refresh-note">
            {refreshDateLabel}
            {isRefreshedToday ? " · 今天已刷新，可手动重新刷新" : ""}
          </p>
          {dashboardRefreshMessage ? <div className="topic-confirm-message">{dashboardRefreshMessage}</div> : null}
        </div>

        <article className="today-topic-card">
          <span className="command-tag red">今日推荐选题</span>
          <h3>{heroTopic.title}</h3>
          <dl>
            <div><dt>目标用户</dt><dd>{heroTopic.targetUser}</dd></div>
            <div><dt>内容类型</dt><dd>{heroTopic.contentType}</dd></div>
            <div><dt>产品关联</dt><dd>{heroTopic.productAssociation}</dd></div>
            <div><dt>推荐平台</dt><dd>{heroTopic.platform}</dd></div>
          </dl>
          <div className="command-actions compact">
            <button className="command-button primary" onClick={() => setActiveView("production")} type="button">生成脚本</button>
            <button className="command-button secondary" onClick={() => setActiveView("topics")} type="button">加入本周计划</button>
            <button className="command-button secondary" disabled={confirmHeroLoading} onClick={confirmHeroTopic} type="button">
              {confirmHeroLoading ? "确认中" : "确认入选题池"}
            </button>
          </div>
        </article>
      </section>

      {dashboardRefreshSources.length > 0 ? (
        <section className="command-panel dashboard-source-panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">Daily Sources</span>
              <h2>今日刷新来源</h2>
              <p>最近一次首页刷新参考的联网搜索结果，确认入池前可先核对依据。</p>
            </div>
          </div>
          <div className="dashboard-source-list">
            {dashboardRefreshSources.slice(0, 6).map((source) => (
              <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                <strong>{source.title || source.siteName || "来源链接"}</strong>
                <span>{source.siteName || source.datePublished || "联网来源"}</span>
                <p>{source.summary || source.snippet}</p>
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>
      ) : null}

      <section className="command-stat-grid">
        {industryProfile.dashboard.stats.map((stat) => (
          <article className="command-stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.detail}</small>
          </article>
        ))}
      </section>

      <section className="command-panel ai-command-panel">
        <div className="command-section-head">
          <div>
            <span className="command-kicker">抖音 · Tavily · DeepSeek</span>
            <h2>{industryProfile.label} AI 今日决策</h2>
            <p>调用抖音视频搜索 + Tavily 网页搜索，经 DeepSeek 分析总结，基于账号定位、热点、选题和素材生成建议。</p>
          </div>
          <button className="command-button primary" disabled={Boolean(dashboardAiLoading)} onClick={requestTodayDecision} type="button">
            {dashboardAiLoading ? "生成中" : "重新生成"}
          </button>
        </div>
        <div className="command-chip-row">
          {industryProfile.quickTopics.map((topic) => (
            <button className="command-chip" disabled={Boolean(dashboardAiLoading)} key={topic} onClick={() => applyQuickTopic(topic)} type="button">
              {topic}
            </button>
          ))}
        </div>
        {dashboardAiError ? <div className="research-error">{dashboardAiError}</div> : null}
        {dashboardAi ? <DashboardAiResult state={dashboardAi} /> : <StaticDecisionPreview industryProfile={industryProfile} />}
      </section>

      <section className="command-panel">
        <div className="command-section-head">
          <div>
            <span className="command-kicker">Production Workflow</span>
            <h2>选题生产工作流</h2>
            <p>从账号定位到发布复盘，把一个选题做成可发布的视频。</p>
          </div>
        </div>
        <div className="workflow-grid">
          {industryProfile.dashboard.workflowSteps.map((step) => (
            <article className="workflow-card" key={step.title}>
              <b>{step.icon}</b>
              <h3>{step.title}</h3>
              <p>{step.detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="command-section-grid">
        <div className="command-panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">Content Assets</span>
              <h2>内容资产库</h2>
            </div>
          </div>
          <div className="asset-grid">
            {industryProfile.dashboard.assetCards.map((asset) => (
              <article className="asset-card" key={asset.title}>
                <span className="command-tag green">{asset.count}</span>
                <h3>{asset.title}</h3>
                <p>{asset.detail}</p>
                <small>最近更新：{asset.updated}</small>
                <button className="asset-link" onClick={() => setActiveView(asset.title.includes("脚本") ? "scripts" : "materials")} type="button">
                  进入
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="command-panel weekly-panel">
          <div className="command-section-head">
            <div>
              <span className="command-kicker">Weekly Plan</span>
              <h2>本周发布计划</h2>
            </div>
            <button
              className="icon-button"
              disabled={weeklyPlanLoading}
              onClick={handleRefreshWeeklyPlan}
              title="从选题池智能生成本周发布计划"
              type="button"
            >
              {weeklyPlanLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
              <span>{weeklyPlanLoading ? "生成中" : "刷新"}</span>
            </button>
          </div>
          <div className="weekly-list">
            {weeklyPlan.map((item) => (
              <article key={item.day}>
                <span>{item.day}</span>
                <h3>{item.theme}</h3>
                <p>{item.output}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="command-panel">
        <div className="command-section-head">
          <div>
            <span className="command-kicker">Review Loop</span>
            <h2>复盘与优化</h2>
            <p>把播放、收藏、评论和线索变成下一轮选题依据。</p>
          </div>
        </div>
        <div className="review-command-grid">
          {reviewCards.map((card, index) => (
            <article className="review-command-card" key={card.title}>
              <span className={`command-tag ${index === 0 ? "red" : index === 1 ? "yellow" : "green"}`}>{card.title}</span>
              <strong>{card.metric}</strong>
              <p>{card.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </section>
  );
}

function StaticDecisionPreview({ industryProfile }: { industryProfile: IndustryProfile }) {
  const ideas =
    industryProfile.id === "bbq"
      ? [
          { title: "烧烤店淡季先别降价，先重做这 3 类串品组合", user: "烧烤店老板", angle: "成本控制", product: "牛肉串、掌中宝、夜宵组合", script: "痛点型口播" },
          { title: "夏季夜宵前烧烤店该提前备哪些高频串品", user: "后厨负责人", angle: "节气备货", product: "牛羊肉串、鸡翅、蘸料", script: "清单型短视频" },
          { title: "为什么采购只看单价，最后反而更贵", user: "餐饮采购负责人", angle: "采购避坑", product: "串品、规格标准、稳定供货", script: "避坑型脚本" },
        ]
      : [
          { title: "火锅店淡季先别打折，先重做这 3 类食材组合", user: "火锅店老板", angle: "成本控制", product: "丸滑、小吃甜品、外卖组合", script: "痛点型口播" },
          { title: "冬至前火锅店该提前备哪些高频食材", user: "后厨负责人", angle: "节气备货", product: "牛羊肉、锅底、小料", script: "清单型短视频" },
          { title: "为什么采购只看单价，最后反而更贵", user: "餐饮采购负责人", angle: "采购避坑", product: "毛肚、鸭肠、规格标准", script: "避坑型脚本" },
        ];

  return (
    <div className="static-decision-grid">
      {ideas.map((idea) => (
        <article key={idea.title}>
          <span>{idea.user} / {idea.angle}</span>
          <h3>{idea.title}</h3>
          <p>产品关联：{idea.product}</p>
          <small>脚本方向：{idea.script}</small>
        </article>
      ))}
    </div>
  );
}

function DashboardAiResult({ state }: { state: DashboardAiState }) {
  const { result } = state;

  return (
    <div className="dashboard-ai-result">
      <div className="dashboard-ai-result-head">
        <div>
          <span>{state.label}</span>
          <h3>{result.summary}</h3>
          <p>{result.matchedReason}</p>
        </div>
        <b className={`priority-pill priority-${result.matchScore}`}>{result.matchScore}匹配</b>
      </div>

      <div className="dashboard-ai-grid">
        <div>
          <h4>内容角度</h4>
          <div className="chip-row">
            {result.angles.map((angle) => (
              <span className="chip" key={angle}>
                {angle}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h4>风险提醒</h4>
          <ul>
            {result.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dashboard-ai-topic-list">
        {result.topicIdeas.map((idea) => (
          <article key={idea.title}>
            <span>{idea.targetUser} · {idea.platform}</span>
            <h4>{idea.title}</h4>
            <p>{idea.coreView}</p>
            <small>{idea.angle} / {idea.format}</small>
          </article>
        ))}
      </div>

      <div className="dashboard-ai-sources">
        {result.sources.slice(0, 4).map((source) => (
          <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
            {source.siteName || source.title}
          </a>
        ))}
      </div>
    </div>
  );
}

function TopicCandidatePanel({
  emptyText,
  onConfirm,
  onUpdate,
  result,
  title,
}: {
  emptyText: string;
  onConfirm: (candidate: GeneratedTopicCandidate) => void;
  onUpdate: (id: string, field: keyof GeneratedTopicCandidate, value: string | number) => void;
  result: TopicCandidateGenerateResult | null;
  title: string;
}) {
  if (!result) {
    return null;
  }

  return (
    <section className="panel topic-candidate-panel">
      <div className="section-heading">
        <div>
          <h2>{title}</h2>
          <span>{result.candidates.length > 0 ? `本轮生成 ${result.candidates.length} 条候选，确认后写入选题池` : emptyText}</span>
        </div>
      </div>
      {result.candidates.length === 0 ? <p className="empty-text">{emptyText}</p> : null}
      {result.candidates.length > 0 ? (
        <div className="candidate-grid">
          {result.candidates.map((candidate) => (
            <article className="candidate-card" key={candidate.id}>
              <div className="candidate-card-head">
                <span>{candidate.topicCategory}</span>
                {candidate.industry ? <span className="tag">{candidate.industry === "bbq" ? "烧烤" : "火锅"}</span> : null}
                <b>{candidate.recommendationScore}/100</b>
              </div>
              <label>
                <span>标题</span>
                <input onChange={(event) => onUpdate(candidate.id, "title", event.target.value)} value={candidate.title} />
              </label>
              <label>
                <span>用户痛点</span>
                <textarea
                  onChange={(event) => onUpdate(candidate.id, "painPoint", event.target.value)}
                  rows={2}
                  value={candidate.painPoint}
                />
              </label>
              <label>
                <span>内容角度</span>
                <textarea
                  onChange={(event) => onUpdate(candidate.id, "angle", event.target.value)}
                  rows={2}
                  value={candidate.angle}
                />
              </label>
              <label>
                <span>业务关联</span>
                <textarea
                  onChange={(event) => onUpdate(candidate.id, "businessLink", event.target.value)}
                  rows={2}
                  value={candidate.businessLink}
                />
              </label>
              <p>{candidate.coreView}</p>
              <small>{candidate.hotSource}</small>
              <div className="candidate-source-row">
                {candidate.sourceUrls.map((url) => (
                  <a href={url} key={url} rel="noreferrer" target="_blank">
                    来源 <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ))}
              </div>
              {candidate.risks.length > 0 ? (
                <ul>
                  {candidate.risks.map((risk) => (
                    <li key={risk}>{risk}</li>
                  ))}
                </ul>
              ) : null}
              <button className="icon-button" onClick={() => onConfirm(candidate)} type="button">
                <CheckCircle2 size={18} aria-hidden="true" />
                <span>确认入池</span>
              </button>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function TopicsView({
  activeIndustry,
  industryProfile,
  column,
  filteredTopics,
  onStartProduction,
  onTopicConfirmed,
  onTopicDeleted,
  query,
  selectedTopic,
  setColumn,
  setContentStatus,
  setQuery,
  setSelectedTopicId,
  setSourceFilter,
  contentStatus,
  sourceFilter,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  column: string;
  filteredTopics: Topic[];
  onStartProduction: (topicId: string) => void;
  onTopicConfirmed: (topic: Topic) => void;
  onTopicDeleted: (topicId: string) => void;
  query: string;
  selectedTopic: Topic | undefined;
  setColumn: (value: string) => void;
  setContentStatus: (value: ContentStatusFilter) => void;
  setQuery: (value: string) => void;
  setSelectedTopicId: (value: string) => void;
  setSourceFilter: (value: SourceFilter) => void;
  contentStatus: ContentStatusFilter;
  sourceFilter: SourceFilter;
}) {
  const [candidateForm, setCandidateForm] = useState<TopicCandidateGenerateRequest>(() =>
    buildDefaultTopicCandidateForm(industryProfile),
  );
  const [candidateResult, setCandidateResult] = useState<TopicCandidateGenerateResult | null>(null);
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateError, setCandidateError] = useState("");
  const [candidateMessage, setCandidateMessage] = useState("");
  const [refreshResult, setRefreshResult] = useState<TopicCandidateGenerateResult | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshError, setRefreshError] = useState("");
  const [refreshMessage, setRefreshMessage] = useState("");
  const [deleteLoadingTopicId, setDeleteLoadingTopicId] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [deleteMessage, setDeleteMessage] = useState("");
  const detailTopic = selectedTopic ?? filteredTopics[0] ?? filteredTopics[0];

  useEffect(() => {
    setCandidateForm(buildDefaultTopicCandidateForm(industryProfile));
    setCandidateResult(null);
    setRefreshResult(null);
  }, [industryProfile]);

  const updateCandidateForm = (field: keyof TopicCandidateGenerateRequest, value: string | number) => {
    setCandidateForm((current) => ({ ...current, [field]: value }));
  };

  const generateTopicCandidates = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCandidateLoading(true);
    setCandidateError("");
    setCandidateMessage("");

    try {
      const response = await fetch("/api/topic-candidates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(candidateForm),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "联网选题生成失败");
      }

      const result = payload as TopicCandidateGenerateResult;
      setCandidateResult(result);
      setCandidateMessage(result.warning ? `已降级生成：${result.warning}` : "");
    } catch (caught) {
      setCandidateError(caught instanceof Error ? caught.message : "联网选题生成失败");
    } finally {
      setCandidateLoading(false);
    }
  };

  const refreshTopicsFromFilters = async () => {
    setRefreshLoading(true);
    setRefreshError("");
    setRefreshMessage("");

    const payload: TopicRefreshRequest = {
      industry: activeIndustry,
      query,
      column,
      sourceFilter,
      contentStatus,
      limit: 5,
    };

    try {
      const response = await fetch("/api/topics/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(result.error ?? "选题重调研失败");
      }

      const candidateResultPayload = result as TopicCandidateGenerateResult;
      setRefreshResult(candidateResultPayload);
      setRefreshMessage(candidateResultPayload.warning ? `已降级生成：${candidateResultPayload.warning}` : "");
      setRefreshMessage("已完成本轮联网重调研，请确认候选后再入池。");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "选题重调研失败";
      setRefreshError(
        /本地服务未更新|\/api\/topics\/refresh/.test(message)
          ? "当前运行中的本地服务还没有 /api/topics/refresh，请重启 npm run dev 后重试。"
          : message,
      );
    } finally {
      setRefreshLoading(false);
    }
  };

  const updateCandidate = (id: string, field: keyof GeneratedTopicCandidate, value: string | number) => {
    setCandidateResult((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.id === id ? { ...candidate, [field]: value } : candidate,
        ),
      };
    });
  };

  const updateRefreshCandidate = (id: string, field: keyof GeneratedTopicCandidate, value: string | number) => {
    setRefreshResult((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        candidates: current.candidates.map((candidate) =>
          candidate.id === id ? { ...candidate, [field]: value } : candidate,
        ),
      };
    });
  };

  const confirmCandidate = async (candidate: GeneratedTopicCandidate, columnValue: string, source: "refresh" | "form") => {
    setCandidateError("");
    setCandidateMessage("");
    setRefreshError("");
    setRefreshMessage("");

    try {
      const response = await fetch("/api/topics/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...candidate, column: columnValue }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "确认入池失败");
      }

      const topic = payload as Topic;
      onTopicConfirmed(topic);
      if (source === "refresh") {
        setRefreshMessage(`已确认入池：${topic.title}`);
        setRefreshResult((current) =>
          current
            ? {
                ...current,
                candidates: current.candidates.filter((item) => item.id !== candidate.id),
              }
            : current,
        );
      } else {
        setCandidateMessage(`已确认入池：${topic.title}`);
        setCandidateResult((current) =>
          current
            ? {
                ...current,
                candidates: current.candidates.filter((item) => item.id !== candidate.id),
              }
            : current,
        );
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "确认入池失败";
      if (source === "refresh") {
        setRefreshError(message);
      } else {
        setCandidateError(message);
      }
    }
  };

  const deleteTopicFromPool = async (topic: Topic) => {
    const confirmed = window.confirm(`确定删除《${topic.title}》吗？删除后会同时清理这个选题的生产进度，但不会删除发布复盘记录。`);
    if (!confirmed) {
      return;
    }

    setDeleteLoadingTopicId(topic.id);
    setDeleteError("");
    setDeleteMessage("");

    try {
      const response = await fetch("/api/topics/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: topic.id }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "删除选题失败");
      }

      const nextTopic = filteredTopics.find((item) => item.id !== topic.id);
      onTopicDeleted(topic.id);
      if (detailTopic?.id === topic.id) {
        setSelectedTopicId(nextTopic?.id ?? "");
      }
      setDeleteMessage(`已删除选题：${topic.title}`);
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : "删除选题失败");
    } finally {
      setDeleteLoadingTopicId("");
    }
  };

  return (
    <section className="topics-workspace">
      <div className="topics-layout">
        <div className="topic-list-panel">
          <div className="topics-toolbar">
            <div className="topics-toolbar-copy">
              <strong>联网重调研</strong>
              <span>{industryProfile.label}行业下，按当前筛选条件调用抖音视频搜索 + Tavily 网页搜索，经 DeepSeek 分析总结，生成待确认的新候选。</span>
            </div>
            <div className="topics-toolbar-actions">
              <button className="icon-button filter-refresh-button" disabled={refreshLoading} onClick={refreshTopicsFromFilters} type="button">
                {refreshLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                <span>{refreshLoading ? "调研中" : "重新调研"}</span>
              </button>
            </div>
          </div>
          <div className="filter-row">
            <label className="search-box">
              <Search size={18} aria-hidden="true" />
              <input
                aria-label="搜索选题"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索标题、痛点、观点"
                value={query}
              />
            </label>
            <label className="filter-select">
              <span>内容栏目</span>
              <select aria-label="筛选内容栏目" onChange={(event) => setColumn(event.target.value)} value={column}>
                <option value="全部栏目">全部栏目</option>
                {industryProfile.columns.map((item) => (
                  <option key={item} value={item}>
                    {getColumnLabel(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>选题来源</span>
              <select
                aria-label="筛选选题来源"
                onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
                value={sourceFilter}
              >
                <option value="全部来源">全部来源</option>
                {sourceFilterOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="filter-select">
              <span>内容状态</span>
              <select
                aria-label="筛选内容状态"
                onChange={(event) => setContentStatus(event.target.value as ContentStatusFilter)}
                value={contentStatus}
              >
                <option value="全部状态">全部状态</option>
                {contentStatusOptions.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          {refreshError ? <div className="research-error">{refreshError}</div> : null}
          {refreshMessage ? <div className="topic-confirm-message">{refreshMessage}</div> : null}
          {deleteError ? <div className="research-error">{deleteError}</div> : null}
          {deleteMessage ? <div className="topic-confirm-message">{deleteMessage}</div> : null}

          <TopicCandidatePanel
            emptyText={`当前 ${industryProfile.label} 筛选条件下没有生成新的候选选题，可以换个关键词或栏目再试。`}
            onConfirm={(candidate) => confirmCandidate(candidate, refreshResult?.request.column ?? candidateForm.column, "refresh")}
            onUpdate={updateRefreshCandidate}
            result={refreshResult}
            title="联网候选，待确认入池"
          />

          <div className="topic-list" aria-live="polite">
            {filteredTopics.map((topic) => (
              <article
                className={`topic-row ${detailTopic?.id === topic.id ? "active" : ""}`}
                key={topic.id}
              >
                <button className="topic-row-main" onClick={() => setSelectedTopicId(topic.id)} type="button">
                  <span className="topic-title">{topic.title}</span>
                  <span className="topic-meta">
                    {getColumnLabel(topic.column)}｜{getSourceLabel(topic)}｜{getContentStatusLabel(topic)}
                  </span>
                  <span className="topic-summary">{topic.coreView}</span>
                  <span className="topic-footnote">
                    {topic.platform} · {topic.format}
                  </span>
                </button>
                <div className="topic-row-actions">
                  <button className="inline-ai-button topic-production-button" onClick={() => onStartProduction(topic.id)} type="button">
                    进入生产
                  </button>
                  <button
                    className="icon-button danger topic-delete-button"
                    disabled={deleteLoadingTopicId === topic.id}
                    onClick={() => deleteTopicFromPool(topic)}
                    title="删除选题"
                    type="button"
                  >
                    {deleteLoadingTopicId === topic.id ? <Loader2 className="spin-icon" size={16} aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
                    <span>{deleteLoadingTopicId === topic.id ? "删除中" : "删除"}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <article className="detail-panel">
          {!detailTopic ? (
            <div className="empty-text">当前行业下还没有可展示的选题，请先生成或确认入池一个选题。</div>
          ) : (
            <>
          <div className="detail-header">
            <div className="tag-row">
              <span className="tag">{getColumnLabel(detailTopic.column)}</span>
              <span className="tag">{getSourceLabel(detailTopic)}</span>
              <span className="tag">{getContentStatusLabel(detailTopic)}</span>
              <span className="tag">{industryProfile.label}</span>
              {detailTopic.aiGenerated ? <span className="tag">AI生成</span> : null}
            </div>
            <h2>{detailTopic.title}</h2>
            <p>{detailTopic.coreView}</p>
            <button className="icon-button" onClick={() => onStartProduction(detailTopic.id)} type="button">
              <Clapperboard size={18} aria-hidden="true" />
              <span>进入内容生产</span>
            </button>
          </div>
          <dl className="detail-grid">
            <Detail label="内容栏目" value={getColumnLabel(detailTopic.column)} />
            <Detail label="选题来源" value={getSourceLabel(detailTopic)} />
            <Detail label="内容状态" value={getContentStatusLabel(detailTopic)} />
            <Detail label="目标用户" value={detailTopic.targetUser} />
            <Detail label="适合发布平台" value={detailTopic.platform} />
            <Detail label="建议内容形式" value={detailTopic.format} />
            <Detail label="用户痛点" value={detailTopic.painPoint} />
            <Detail label="业务关联" value={detailTopic.businessLink} />
            <Detail label="热点来源" value={detailTopic.hotSource} />
            <Detail label="内容角度" value={detailTopic.angle} />
            <Detail label="推荐分数" value={detailTopic.recommendationScore ? `${detailTopic.recommendationScore}/100` : "手动选题"} />
            <Detail label="复盘结论" value={detailTopic.review} />
          </dl>
          {detailTopic.sourceUrls?.length ? (
            <div className="topic-source-links">
              {detailTopic.sourceUrls.map((url) => (
                <a href={url} key={url} rel="noreferrer" target="_blank">
                  来源 <ExternalLink size={14} aria-hidden="true" />
                </a>
              ))}
            </div>
          ) : null}
          {detailTopic.riskNotes?.length ? (
            <ul className="topic-risk-list">
              {detailTopic.riskNotes.map((risk) => (
                <li key={risk}>{risk}</li>
              ))}
            </ul>
          ) : null}
          <div className="publish-strip">
            <Metric label="播放" value={formatNumber(detailTopic.publishData.views)} detail="views" />
            <Metric label="点赞" value={formatNumber(detailTopic.publishData.likes)} detail="likes" />
            <Metric label="收藏" value={formatNumber(detailTopic.publishData.saves)} detail="saves" />
            <Metric label="转化" value={formatNumber(detailTopic.publishData.conversions)} detail="leads" />
          </div>
            </>
          )}
        </article>
      </div>

      <section className="panel topic-generator-panel">
        <div className="section-heading">
          <div>
            <h2>联网选题</h2>
            <span>公开网页聚合 + AI 归纳评分，人工确认后写入选题池</span>
          </div>
        </div>
        <form className="topic-generator-form" onSubmit={generateTopicCandidates}>
          <label>
            <span>选题类型</span>
            <select
              onChange={(event) => updateCandidateForm("category", event.target.value as TopicCategory)}
              value={candidateForm.category}
            >
              {topicCategories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>调研关键词</span>
            <input
              onChange={(event) => updateCandidateForm("query", event.target.value)}
              placeholder={adaptIndustryText(industryProfile.defaultTopicCandidate.query, industryProfile)}
              required
              value={candidateForm.query}
            />
          </label>
          <label>
            <span>适配栏目</span>
            <select onChange={(event) => updateCandidateForm("column", event.target.value)} value={candidateForm.column}>
              {industryProfile.columns.map((item) => (
                <option key={item} value={item}>
                  {getColumnLabel(item)}
                </option>
              ))}
              </select>
          </label>
          <label>
            <span>目标用户</span>
            <input
              onChange={(event) => updateCandidateForm("targetUser", event.target.value)}
              value={candidateForm.targetUser}
            />
          </label>
          <label>
            <span>时间范围</span>
            <select
              onChange={(event) => updateCandidateForm("freshness", event.target.value as ResearchFreshness)}
              value={candidateForm.freshness}
            >
              {freshnessOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>数量</span>
            <input
              max={8}
              min={1}
              onChange={(event) => updateCandidateForm("limit", Number(event.target.value))}
              type="number"
              value={candidateForm.limit}
            />
          </label>
          <label className="topic-generator-notes">
            <span>补充说明</span>
            <textarea
              onChange={(event) => updateCandidateForm("notes", event.target.value)}
              placeholder="可以补充产品、地区、平台偏好或避开的方向"
              rows={3}
              value={candidateForm.notes}
            />
          </label>
          <button className="icon-button" disabled={candidateLoading} type="submit">
            {candidateLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
            <span>{candidateLoading ? "生成中" : "生成候选"}</span>
          </button>
        </form>

        {candidateError ? <div className="research-error">{candidateError}</div> : null}
        {candidateMessage ? <div className="topic-confirm-message">{candidateMessage}</div> : null}
        <TopicCandidatePanel
          emptyText="本轮联网选题没有生成新的候选，可调整关键词或时间范围后重试。"
          onConfirm={(candidate) => confirmCandidate(candidate, candidateForm.column, "form")}
          onUpdate={updateCandidate}
          result={candidateResult}
          title="详细联网候选"
        />
      </section>
    </section>
  );
}

function ProductionView({
  activeIndustry,
  industryProfile,
  onScriptTemplateSaved,
  onProductionSaved,
  productionTopicId,
  productionTopicIds,
  productions,
  removeProductionTopic,
  scriptTemplates,
  setProductionTopicId,
  topics,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  onScriptTemplateSaved: (template: ScriptTemplate) => void;
  onProductionSaved: (production: ContentProduction, review: ReviewRecord | null, topic: Topic | null) => void;
  productionTopicId: string;
  productionTopicIds: string[];
  productions: ContentProduction[];
  removeProductionTopic: (topicId: string) => void;
  scriptTemplates: ScriptTemplate[];
  setProductionTopicId: (topicId: string) => void;
  topics: Topic[];
}) {
  const visibleTopics = productionTopicIds
    .map((topicId) => topics.find((topic) => topic.id === topicId && getTopicIndustry(topic) === activeIndustry))
    .filter((topic): topic is Topic => Boolean(topic));
  const selectedTopic = visibleTopics.find((topic) => topic.id === productionTopicId) ?? visibleTopics[0];
  const selectedTopicIdValue = selectedTopic?.id ?? "";
  const [production, setProduction] = useState<ContentProduction>(() =>
    productions.find((item) => item.topicId === selectedTopicIdValue) ?? emptyProduction(selectedTopicIdValue, activeIndustry),
  );
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadingAction, setLoadingAction] = useState("");

  useEffect(() => {
    if (!selectedTopic) {
      return;
    }
    setProduction(productions.find((item) => item.topicId === selectedTopic.id) ?? emptyProduction(selectedTopic.id, activeIndustry));
    setMessage("");
    setError("");
  }, [activeIndustry, productions, selectedTopic]);

  const availableScriptTemplates = scriptTemplates.filter((template) => !template.industry || template.industry === activeIndustry);
  const selectedTemplate =
    availableScriptTemplates.find((template) => template.id === production.selectedTemplateId) ??
    availableScriptTemplates[0] ??
    scriptTemplates[0];

  const patchProduction = (patch: Partial<ContentProduction>) => {
    setProduction((current) => ({ ...current, ...patch }));
  };

  const patchScriptDraft = (field: keyof ContentProduction["scriptDraft"], value: string) => {
    setProduction((current) => ({
      ...current,
      scriptDraft: { ...current.scriptDraft, [field]: value },
    }));
  };

  const patchPublishDraft = (
    field: keyof ContentProduction["publishDraft"],
    value: string | string[] | ContentProduction["publishDraft"]["platformCopies"],
  ) => {
    setProduction((current) => ({
      ...current,
      publishDraft: { ...current.publishDraft, [field]: value },
    }));
  };

  const patchReviewDraft = (field: keyof ContentProduction["reviewDraft"], value: string | number) => {
    setProduction((current) => ({
      ...current,
      reviewDraft: { ...current.reviewDraft, [field]: value },
    }));
  };

  const updateMaterialBucket = (field: keyof ContentProduction["matchedMaterials"], value: string, checked: boolean) => {
    setProduction((current) => {
      const currentItems = current.matchedMaterials[field];
      const nextItems = checked ? [...currentItems, value] : currentItems.filter((item) => item !== value);
      return {
        ...current,
        matchedMaterials: { ...current.matchedMaterials, [field]: nextItems },
      };
    });
  };

  const saveProduction = async (nextProduction = production) => {
    if (!selectedTopic) {
      return;
    }
    setLoadingAction("save");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextProduction),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "保存生产进度失败");
      }

      setProduction(payload.production as ContentProduction);
      onProductionSaved(
        payload.production as ContentProduction,
        (payload.review as ReviewRecord | null) ?? null,
        (payload.topic as Topic | null) ?? null,
      );
      setMessage("生产进度已保存");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存生产进度失败");
    } finally {
      setLoadingAction("");
    }
  };

  const runProductionResearch = async () => {
    if (!selectedTopic) {
      return;
    }
    setLoadingAction("research");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: selectedTopic.id, notes: production.researchNotes, industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "联网调研失败");
      }

      const result = payload as ResearchResult;
      patchProduction({
        currentStep: "research",
        researchNotes: [
          result.summary,
          result.matchedReason,
          ...result.angles.map((angle) => `- ${angle}`),
          ...result.risks.map((risk) => `风险：${risk}`),
        ].join("\n"),
      });
      setMessage("调研依据已生成，可继续人工补充");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "联网调研失败");
    } finally {
      setLoadingAction("");
    }
  };

  const generateScript = async () => {
    if (!selectedTopic) {
      return;
    }
    setLoadingAction("script");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/generate-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...production, industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "脚本生成失败");
      }

      patchProduction({ currentStep: "script", scriptDraft: payload as ContentProduction["scriptDraft"] });
      setMessage("脚本草稿已生成");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "脚本生成失败");
    } finally {
      setLoadingAction("");
    }
  };

  const generatePublish = async () => {
    if (!selectedTopic) {
      return;
    }
    setLoadingAction("publish");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/generate-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...production, industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "发布文案生成失败");
      }

      patchProduction({ currentStep: "publish", publishDraft: payload as ContentProduction["publishDraft"] });
      setMessage("发布文案已生成");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "发布文案生成失败");
    } finally {
      setLoadingAction("");
    }
  };

  const saveScriptTemplate = async () => {
    if (!selectedTopic) {
      return;
    }
    setLoadingAction("saveScriptTemplate");
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/production/save-script-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: selectedTopic.id,
          industry: activeIndustry,
          selectedTemplateId: production.selectedTemplateId,
          scriptDraft: production.scriptDraft,
        }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "保存脚本内容失败");
      }

      onScriptTemplateSaved(payload.template as ScriptTemplate);
      setMessage("脚本内容已保存到脚本模板库");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "保存脚本内容失败");
    } finally {
      setLoadingAction("");
    }
  };

  const saveCurrentStep = () => saveProduction(production);
  const hasScriptDraft = [
    production.scriptDraft.opener,
    production.scriptDraft.structure,
    production.scriptDraft.ending,
    production.scriptDraft.voiceover,
  ].some((item) => item.trim().length > 0);

  return (
    <section className="production-layout">
      <aside className="panel production-sidebar">
        <div className="section-heading">
          <div>
            <h2>内容生产流程</h2>
            <span>{industryProfile.label}内容生产流程</span>
          </div>
        </div>
        <div className="production-topic-picker">
          <span>当前选题</span>
          {visibleTopics.length > 0 ? (
            <div className="production-topic-control">
              <select
                aria-label="当前选题"
                onChange={(event) => setProductionTopicId(event.target.value)}
                value={selectedTopic?.id ?? ""}
              >
                {visibleTopics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
              <button
                aria-label={selectedTopic ? `将《${selectedTopic.title}》移出内容生产台` : "移出当前选题"}
                className="ghost-button production-topic-delete"
                disabled={!selectedTopic}
                onClick={() => {
                  if (selectedTopic) {
                    removeProductionTopic(selectedTopic.id);
                  }
                }}
                title="移出当前选题"
                type="button"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <p className="production-empty-note">暂无当前选题，可从选题池加入。</p>
          )}
        </div>
        {selectedTopic ? (
          <>
            <div className="production-step-list">
              {productionSteps.map((step, index) => (
                <button
                  className={`production-step ${production.currentStep === step.id ? "active" : ""}`}
                  key={step.id}
                  onClick={() => patchProduction({ currentStep: step.id })}
                  type="button"
                >
                  <b>{index + 1}</b>
                  <div className="production-step-copy">
                    <span>{step.label}</span>
                    <small>{step.description}</small>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : null}
        <button className="icon-button" disabled={!selectedTopic || loadingAction === "save"} onClick={saveCurrentStep} type="button">
          {loadingAction === "save" ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <CheckCircle2 size={18} aria-hidden="true" />}
          <span>{loadingAction === "save" ? "保存中" : "保存进度"}</span>
        </button>
      </aside>

      <main className="panel production-main">
        {!selectedTopic ? (
          <section className="production-empty">
            <h2>先从{industryProfile.label}选题池选择一个选题</h2>
            <p>内容生产台会围绕一个选题推进调研、脚本、素材、发布和复盘。你也可以先清理当前列表，再从选题池重新加入需要推进的选题。</p>
          </section>
        ) : (
          <>
            <div className="production-main-head">
              <div>
                <p className="eyebrow">{getColumnLabel(selectedTopic.column)} / {getSourceLabel(selectedTopic)} / {industryProfile.label}</p>
                <h2>{selectedTopic.title}</h2>
                <p>{selectedTopic.coreView}</p>
              </div>
              <span className="tag">{productionSteps.find((step) => step.id === production.currentStep)?.label}</span>
            </div>

            {error ? <div className="research-error">{error}</div> : null}
            {message ? <div className="topic-confirm-message">{message}</div> : null}

            {production.currentStep === "topic" ? (
          <div className="production-section">
            <dl className="detail-grid">
              <Detail label="标题" value={selectedTopic.title} />
              <Detail label="内容栏目" value={getColumnLabel(selectedTopic.column)} />
              <Detail label="选题来源" value={getSourceLabel(selectedTopic)} />
              <Detail label="内容状态" value={getContentStatusLabel(selectedTopic)} />
              <Detail label="核心观点" value={selectedTopic.coreView} />
              <Detail label="目标用户" value={selectedTopic.targetUser} />
              <Detail label="用户痛点" value={selectedTopic.painPoint} />
              <Detail label="业务关联" value={selectedTopic.businessLink} />
            </dl>
          </div>
            ) : null}

            {production.currentStep === "research" ? (
          <div className="production-section">
            <div className="section-heading">
              <div>
                <h2>调研依据</h2>
                <span>行业热点、节气节点、用户痛点、产品卖点</span>
              </div>
              <button className="icon-button" disabled={loadingAction === "research"} onClick={runProductionResearch} type="button">
                {loadingAction === "research" ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Globe2 size={18} aria-hidden="true" />}
                <span>{loadingAction === "research" ? "调研中" : "联网补充"}</span>
              </button>
            </div>
            <textarea
              onChange={(event) => patchProduction({ researchNotes: event.target.value })}
              placeholder="补充行业热点、节气节点、用户痛点、产品卖点等依据"
              rows={12}
              value={production.researchNotes}
            />
          </div>
            ) : null}

            {production.currentStep === "template" ? (
          <div className="production-section">
            <div className="template-choice-grid">
              {availableScriptTemplates
                .map((template) => ({ ...template, name: adaptIndustryText(template.name, industryProfile), scenario: adaptIndustryText(template.scenario, industryProfile), opener: adaptIndustryText(template.opener, industryProfile) }))
                .map((template) => (
                <button
                  className={`template-choice ${production.selectedTemplateId === template.id ? "active" : ""}`}
                  key={template.id}
                  onClick={() => patchProduction({ selectedTemplateId: template.id })}
                  type="button"
                >
                  <strong>{template.name === "爆品推荐型脚本" ? "种草型脚本" : template.name}</strong>
                  <span>{template.scenario}</span>
                  <small>{template.steps.join(" / ")}</small>
                </button>
              ))}
            </div>
            <blockquote>{adaptIndustryText(selectedTemplate.opener, industryProfile)}</blockquote>
          </div>
            ) : null}

            {production.currentStep === "script" ? (
          <div className="production-section">
            <div className="section-heading">
              <div>
                <h2>短视频脚本</h2>
                <span>开头、正文结构、结尾、口播文案</span>
              </div>
              <button className="icon-button" disabled={loadingAction === "script"} onClick={generateScript} type="button">
                {loadingAction === "script" ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                <span>{loadingAction === "script" ? "生成中" : "AI 生成脚本"}</span>
              </button>
            </div>
            <ProductionTextarea label="开头" rows={2} value={production.scriptDraft.opener} onChange={(value) => patchScriptDraft("opener", value)} />
            <ProductionTextarea label="正文结构" rows={5} value={production.scriptDraft.structure} onChange={(value) => patchScriptDraft("structure", value)} />
            <ProductionTextarea label="结尾" rows={2} value={production.scriptDraft.ending} onChange={(value) => patchScriptDraft("ending", value)} />
            <ProductionTextarea label="口播文案" rows={10} value={production.scriptDraft.voiceover} onChange={(value) => patchScriptDraft("voiceover", value)} />
            <div className="production-script-actions">
              <button
                className="icon-button secondary"
                disabled={!hasScriptDraft || loadingAction === "saveScriptTemplate"}
                onClick={saveScriptTemplate}
                type="button"
              >
                {loadingAction === "saveScriptTemplate" ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Save size={18} aria-hidden="true" />}
                <span>{loadingAction === "saveScriptTemplate" ? "保存中" : "保存脚本内容"}</span>
              </button>
            </div>
          </div>
            ) : null}

            {production.currentStep === "materials" ? (
          <div className="production-section">
            <div className="material-match-grid">
              <MaterialChecklist
                field="productImages"
                label="产品图"
                items={(data.materials.find((item) => item.title === "产品资料")?.items ?? []).map((item) => adaptIndustryText(item, industryProfile))}
                production={production}
                updateMaterialBucket={updateMaterialBucket}
              />
              <MaterialChecklist
                field="storeScenes"
                label="门店场景"
                items={(data.materials.find((item) => item.title === "案例素材")?.items ?? []).map((item) => adaptIndustryText(item, industryProfile))}
                production={production}
                updateMaterialBucket={updateMaterialBucket}
              />
              <MaterialChecklist
                field="foodShots"
                label="食材画面"
                items={industryProfile.id === "bbq" ? ["串品近景", "烤制画面", "出餐画面", "后厨备货", "套餐组合"] : ["产品近景", "下锅画面", "出餐画面", "后厨备货", "套餐组合"]}
                production={production}
                updateMaterialBucket={updateMaterialBucket}
              />
              <MaterialChecklist
                field="coverReferences"
                label="封面参考"
                items={["避坑标题封面", "清单型封面", "产品对比封面", "经营观点封面"]}
                production={production}
                updateMaterialBucket={updateMaterialBucket}
              />
            </div>
          </div>
            ) : null}

            {production.currentStep === "publish" ? (
          <div className="production-section">
            <div className="section-heading">
              <div>
                <h2>发布内容</h2>
                <span>标题、简介、话题标签、平台适配文案</span>
              </div>
              <button className="icon-button" disabled={loadingAction === "publish"} onClick={generatePublish} type="button">
                {loadingAction === "publish" ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Sparkles size={18} aria-hidden="true" />}
                <span>{loadingAction === "publish" ? "生成中" : "AI 生成发布文案"}</span>
              </button>
            </div>
            <ProductionTextarea label="发布标题" rows={2} value={production.publishDraft.title} onChange={(value) => patchPublishDraft("title", value)} />
            <ProductionTextarea label="简介" rows={4} value={production.publishDraft.description} onChange={(value) => patchPublishDraft("description", value)} />
            <ProductionTextarea
              label="话题标签"
              rows={2}
              value={production.publishDraft.hashtags.join("，")}
              onChange={(value) => patchPublishDraft("hashtags", value.split(/[，,]/).map((item) => item.trim()).filter(Boolean))}
            />
            <ProductionTextarea
              label="平台适配文案"
              rows={8}
              value={production.publishDraft.platformCopies.map((item) => `${item.platform}：${item.copy}`).join("\n")}
              onChange={(value) =>
                patchPublishDraft(
                  "platformCopies",
                  value
                    .split("\n")
                    .map((line) => {
                      const [platform, ...copyParts] = line.split(/：|:/);
                      return { platform: platform?.trim() || "通用", copy: copyParts.join("：").trim() };
                    })
                    .filter((item) => item.copy),
                )
              }
            />
          </div>
            ) : null}

            {production.currentStep === "review" ? (
          <div className="production-section">
            <div className="review-form-grid">
              <label>
                <span>发布日期</span>
                <input type="date" value={production.reviewDraft.publishDate} onChange={(event) => patchReviewDraft("publishDate", event.target.value)} />
              </label>
              <label>
                <span>平台</span>
                <input value={production.reviewDraft.platform} onChange={(event) => patchReviewDraft("platform", event.target.value)} />
              </label>
              {(["views", "likes", "comments", "saves", "shares", "leads"] as const).map((field) => (
                <label key={field}>
                  <span>{reviewFieldLabel[field]}</span>
                  <input
                    min={0}
                    type="number"
                    value={production.reviewDraft[field]}
                    onChange={(event) => patchReviewDraft(field, Number(event.target.value))}
                  />
                </label>
              ))}
            </div>
            <ProductionTextarea
              label="优化建议"
              rows={5}
              value={production.reviewDraft.optimization}
              onChange={(value) => patchReviewDraft("optimization", value)}
            />
          </div>
            ) : null}
          </>
        )}
      </main>
    </section>
  );
}

const reviewFieldLabel = {
  views: "播放量",
  likes: "点赞",
  comments: "评论",
  saves: "收藏",
  shares: "转发",
  leads: "线索数量",
};

function ProductionTextarea({
  label,
  onChange,
  rows,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  rows: number;
  value: string;
}) {
  return (
    <label className="production-field">
      <span>{label}</span>
      <textarea onChange={(event) => onChange(event.target.value)} rows={rows} value={value} />
    </label>
  );
}

function MaterialChecklist({
  field,
  items,
  label,
  production,
  updateMaterialBucket,
}: {
  field: keyof ContentProduction["matchedMaterials"];
  items: string[];
  label: string;
  production: ContentProduction;
  updateMaterialBucket: (field: keyof ContentProduction["matchedMaterials"], value: string, checked: boolean) => void;
}) {
  const selectedItems = production.matchedMaterials[field];

  return (
    <div className="material-match-card">
      <h3>{label}</h3>
      {items.map((item) => (
        <label key={item}>
          <input
            checked={selectedItems.includes(item)}
            onChange={(event) => updateMaterialBucket(field, item, event.target.checked)}
            type="checkbox"
          />
          <span>{item}</span>
        </label>
      ))}
    </div>
  );
}

function ResearchView({
  activeIndustry,
  industryProfile,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
}) {
  const [form, setForm] = useState<ResearchRequest>(() => buildDefaultResearchForm(industryProfile));
  const [history, setHistory] = useState<ResearchResult[]>([]);
  const [activeResult, setActiveResult] = useState<ResearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const historyStorageKey = storageKeyForIndustry(researchHistoryKey, activeIndustry);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(historyStorageKey);
      if (!saved) {
        return;
      }
      const parsed = JSON.parse(saved) as ResearchResult[];
      if (Array.isArray(parsed)) {
        setHistory(parsed);
        setActiveResult(parsed[0] ?? null);
      }
    } catch {
      window.localStorage.removeItem(historyStorageKey);
    }
  }, [historyStorageKey]);

  useEffect(() => {
    setForm(buildDefaultResearchForm(industryProfile));
    setActiveResult(null);
  }, [industryProfile]);

  const saveHistory = (items: ResearchResult[]) => {
    setHistory(items);
    window.localStorage.setItem(historyStorageKey, JSON.stringify(items));
  };

  const updateForm = (field: keyof ResearchRequest, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const submitResearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, industry: activeIndustry }),
      });
      const payload = await parseResearchResponse(response);

      if (!response.ok) {
        throw new Error(payload.error ?? "调研请求失败");
      }

      const result = payload as ResearchResult;
      const nextHistory = [result, ...history.filter((item) => item.id !== result.id)].slice(0, 12);
      setActiveResult(result);
      saveHistory(nextHistory);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "调研请求失败");
    } finally {
      setIsLoading(false);
    }
  };

  const removeHistoryItem = (id: string) => {
    const next = history.filter((item) => item.id !== id);
    setHistory(next);
    window.localStorage.setItem(historyStorageKey, JSON.stringify(next));
    if (activeResult?.id === id) {
      setActiveResult(null);
    }
  };

  return (
    <section className="research-layout">
      <form className="panel research-form" onSubmit={submitResearch}>
        <div className="section-heading">
          <div>
            <h2>联网调研助手</h2>
            <span>{industryProfile.label}行业下搜索实时信息，再生成 B 端内容判断</span>
          </div>
          <button className="icon-button" disabled={isLoading} type="submit">
            {isLoading ? <Loader2 className="spin-icon" size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}
            <span>{isLoading ? "调研中" : "开始调研"}</span>
          </button>
        </div>

        <label>
          <span>调研主题</span>
          <input
            onChange={(event) => updateForm("query", event.target.value)}
            placeholder={industryProfile.defaultResearch.query}
            required
            value={form.query}
          />
        </label>

        <div className="research-form-grid">
          <label>
            <span>目标用户</span>
            <input
              onChange={(event) => updateForm("targetUser", event.target.value)}
              placeholder={industryProfile.defaultResearch.targetUser}
              value={form.targetUser}
            />
          </label>
          <label>
            <span>适配栏目</span>
            <select onChange={(event) => updateForm("column", event.target.value)} value={form.column}>
              {industryProfile.columns.map((item) => (
                <option key={item} value={item}>
                  {getColumnLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>时间范围</span>
            <select
              onChange={(event) => updateForm("freshness", event.target.value as ResearchFreshness)}
              value={form.freshness}
            >
              {freshnessOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label>
          <span>补充说明</span>
          <textarea
            onChange={(event) => updateForm("notes", event.target.value)}
            placeholder="可以补充地区、平台、想避开的方向、已知产品资料等"
            rows={4}
            value={form.notes}
          />
        </label>

        {error ? <div className="research-error">{error}</div> : null}
      </form>

      <aside className="panel research-history">
        <div className="section-heading">
          <div>
            <h2>调研历史</h2>
            <span>保存在当前浏览器</span>
          </div>
        </div>
        <div className="history-list">
          {history.length === 0 ? <p className="empty-text">暂无调研记录。</p> : null}
          {history.map((item) => (
            <div
              className={`history-row ${activeResult?.id === item.id ? "active" : ""}`}
              key={item.id}
            >
              <button
                className="history-row-content"
                onClick={() => setActiveResult(item)}
                type="button"
              >
                <strong>{item.request.query}</strong>
                <span>
                  {item.matchScore}匹配 · {new Date(item.createdAt).toLocaleString("zh-CN")}
                </span>
              </button>
              <button
                className="icon-button history-delete"
                onClick={(e) => { e.stopPropagation(); removeHistoryItem(item.id); }}
                title="删除此条记录"
                type="button"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <ResearchResultPanel result={activeResult} />
    </section>
  );
}

async function parseResearchResponse(response: Response) {
  const text = await response.text();

  if (!text.trim()) {
    if (response.status === 404) {
      throw new Error("本地服务未更新，当前运行中的后端还没有对应接口，请重启 npm run dev 后重试。");
    }

    throw new Error("服务没有返回内容，请确认本地服务仍在运行。");
  }

  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 180);
    throw new Error(`服务返回了非 JSON 内容：${preview || "空内容"}`);
  }
}

function ResearchResultPanel({ result }: { result: ResearchResult | null }) {
  if (!result) {
    return (
      <section className="panel research-result empty-result">
        <p className="eyebrow">Research Output</p>
        <h2>输入一个热点或行业问题，先查来源，再判断能不能做成内容</h2>
        <p>结果会包含账号匹配度、内容角度、选题建议、风险提醒和引用来源。</p>
      </section>
    );
  }

  return (
    <section className="panel research-result">
      <div className="section-heading">
        <div>
          <h2>{result.request.query}</h2>
          <span>{result.request.targetUser} / {result.request.column}</span>
        </div>
        <b className={`priority-pill priority-${result.matchScore}`}>{result.matchScore}匹配</b>
      </div>

      <div className="research-summary">
        <p>{result.summary}</p>
        <small>{result.matchedReason}</small>
      </div>

      <div className="research-block">
        <h3>适合角度</h3>
        <div className="chip-row">
          {result.angles.map((angle) => (
            <span className="chip" key={angle}>
              {angle}
            </span>
          ))}
        </div>
      </div>

      <div className="research-block">
        <h3>可执行选题</h3>
        <div className="topic-idea-grid">
          {result.topicIdeas.map((idea) => (
            <article className="topic-idea-card" key={idea.title}>
              <span>{idea.targetUser} · {idea.platform}</span>
              <h4>{idea.title}</h4>
              <p>{idea.coreView}</p>
              <small>{idea.angle} / {idea.format}</small>
            </article>
          ))}
        </div>
      </div>

      <div className="research-block">
        <h3>风险提醒</h3>
        <ul className="risk-list">
          {result.risks.map((risk) => (
            <li key={risk}>{risk}</li>
          ))}
        </ul>
      </div>

      <div className="research-block">
        <h3>引用来源</h3>
        <div className="source-list">
          {result.sources.map((source) => (
            <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
              <span>{source.siteName || source.url}</span>
              <strong>{source.title}</strong>
              <p>{source.summary || source.snippet}</p>
              <ExternalLink size={16} aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScriptsView({
  activeIndustry,
  industryProfile,
  onScriptTemplateDeleted,
  scriptTemplates,
  setActiveIndustry,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  onScriptTemplateDeleted: (templateId: string) => void;
  scriptTemplates: ScriptTemplate[];
  setActiveIndustry: (id: IndustryId) => void;
}) {
  const [refreshingTemplateId, setRefreshingTemplateId] = useState<string | null>(null);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [templateOverrides, setTemplateOverrides] = useState<Record<string, { scenario: string; steps: string[]; opener: string }>>({});

  const industryProfiles = data.industryProfiles as IndustryProfile[];
  const currentProfile = industryProfiles.find((p) => p.id === activeIndustry) ?? industryProfile;

  const handleRefreshTemplate = async (template: ScriptTemplate) => {
    setRefreshingTemplateId(template.id);
    try {
      const response = await fetch("/api/scripts/templates/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template, industry: activeIndustry }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `AI 生成失败（${response.status}）`);
      }

      const result = await response.json();
      const overrideKey = `${template.id}:${activeIndustry}`;
      setTemplateOverrides((prev) => ({
        ...prev,
        [overrideKey]: {
          scenario: String(result.scenario ?? "").trim(),
          steps: Array.isArray(result.steps) ? result.steps.map((s: string) => String(s).trim()).filter(Boolean) : [],
          opener: String(result.opener ?? "").trim(),
        },
      }));
    } catch (caught) {
      alert("AI 生成失败，请稍后重试");
    } finally {
      setRefreshingTemplateId(null);
    }
  };

  const resolveTemplate = (template: ScriptTemplate): ScriptTemplate => {
    const overrideKey = `${template.id}:${activeIndustry}`;
    const override = templateOverrides[overrideKey];
    if (!override) return template;
    return {
      ...template,
      scenario: override.scenario || template.scenario,
      steps: override.steps.length > 0 ? override.steps : template.steps,
      opener: override.opener || template.opener,
    };
  };

  const handleDeleteTemplate = async (template: ScriptTemplate) => {
    if (!template.id.startsWith("script-saved-")) {
      return;
    }

    const confirmed = window.confirm(`确定删除《${template.name}》吗？删除后无法从脚本模板库恢复。`);
    if (!confirmed) {
      return;
    }

    setDeletingTemplateId(template.id);
    try {
      const response = await fetch("/api/production/delete-script-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: template.id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `删除失败（${response.status}）`);
      }

      onScriptTemplateDeleted(template.id);
    } catch (caught) {
      alert(caught instanceof Error ? caught.message : "删除失败，请稍后重试");
    } finally {
      setDeletingTemplateId(null);
    }
  };

  const filteredTemplates = scriptTemplates.filter(
    (template) => !template.industry || template.industry === activeIndustry,
  );

  return (
    <section>
      <div className="industry-switcher" role="tablist" aria-label="品类切换" style={{ marginBottom: "20px" }}>
        {industryProfiles.map((profile) => (
          <button
            className={`industry-switch ${activeIndustry === profile.id ? "active" : ""}`}
            key={profile.id}
            onClick={() => setActiveIndustry(profile.id)}
            role="tab"
            type="button"
          >
            {profile.label}
          </button>
        ))}
      </div>
      <section className="template-grid">
        {filteredTemplates.map((template) => {
          const resolved = resolveTemplate(template);
          const isRefreshing = refreshingTemplateId === template.id;
          const isSavedScript = template.id.startsWith("script-saved-");
          const isDeleting = deletingTemplateId === template.id;
          return (
        <article className="panel template-card" key={template.id}>
          <div className="section-heading">
            <h2>{adaptIndustryText(resolved.name, currentProfile)}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span>{resolved.platforms.join(" / ")}</span>
              <button
                className="icon-button"
                disabled={isRefreshing}
                onClick={() => handleRefreshTemplate(template)}
                style={{ minHeight: "34px", padding: "0 12px", fontSize: "12px" }}
                title="AI 刷新模板内容"
                type="button"
              >
                {isRefreshing ? (
                  <Loader2 className="spin-icon" size={14} aria-hidden="true" />
                ) : (
                  <Sparkles size={14} aria-hidden="true" />
                )}
                <span>{isRefreshing ? "生成中" : "刷新"}</span>
              </button>
            </div>
          </div>
          <p>{adaptIndustryText(resolved.scenario, currentProfile)}</p>
          <ol>
            {resolved.steps.map((step) => (
              <li key={step}>{adaptIndustryText(step, currentProfile)}</li>
            ))}
          </ol>
          <blockquote>{adaptIndustryText(resolved.opener, currentProfile)}</blockquote>
          {isSavedScript ? (
            <div className="template-card-actions">
              <button
                className="icon-button danger"
                disabled={isDeleting}
                onClick={() => handleDeleteTemplate(template)}
                title="删除保存的脚本内容"
                type="button"
              >
                {isDeleting ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : <Trash2 size={14} aria-hidden="true" />}
                <span>{isDeleting ? "删除中" : "删除"}</span>
              </button>
            </div>
          ) : null}
        </article>
          );
        })}
      </section>
    </section>
  );
}

type MaterialImageDraft = MaterialImage & {
  previewUrl: string;
  dataUrl?: string;
};

function readImageFileAsDraft(file: File): Promise<MaterialImageDraft> {
  if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
    return Promise.reject(new Error("仅支持 jpg、png、webp、gif 图片。"));
  }

  if (file.size > 5 * 1024 * 1024) {
    return Promise.reject(new Error("单张图片不能超过 5MB。"));
  }

  return new Promise((resolveDraft, rejectDraft) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const productName = file.name.replace(/\.[^.]+$/, "").trim() || "未命名产品";
      resolveDraft({
        id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        productName,
        imageUrl: "",
        previewUrl: dataUrl,
        dataUrl,
        fileName: file.name,
        uploadedAt: new Date().toISOString(),
      });
    };
    reader.onerror = () => rejectDraft(new Error("图片读取失败，请换一张图片重试。"));
    reader.readAsDataURL(file);
  });
}

function MaterialsView({
  activeIndustry,
  industryProfile,
  materials,
  setMaterials,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  materials: Array<MaterialSection & { industry?: IndustryId }>;
  setMaterials: (materials: Array<MaterialSection & { industry?: IndustryId }>) => void;
}) {
  const [expandedItems, setExpandedItems] = useState<Record<string, string[]>>({});
  const [loadingSectionId, setLoadingSectionId] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [editingSection, setEditingSection] = useState<(MaterialSection & { industry?: IndustryId }) | null>(null);
  const [draftImages, setDraftImages] = useState<MaterialImageDraft[]>([]);
  const [saveError, setSaveError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const editableMaterialTitles = new Set(["案例素材", "烧烤门店经营素材"]);

  const openMaterialEditor = (section: MaterialSection & { industry?: IndustryId }) => {
    setEditingSection(section);
    setDraftImages((section.images ?? []).map((image) => ({ ...image, previewUrl: image.imageUrl })));
    setSaveError("");
  };

  const closeMaterialEditor = () => {
    if (isSaving) {
      return;
    }
    setEditingSection(null);
    setDraftImages([]);
    setSaveError("");
  };

  const handleImageFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) {
      return;
    }

    setSaveError("");

    try {
      const nextImages = await Promise.all(files.map(readImageFileAsDraft));
      setDraftImages((current) => [...current, ...nextImages]);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "图片读取失败，请换一张图片重试。");
    }
  };

  const updateDraftImageName = (index: number, productName: string) => {
    setDraftImages((current) => current.map((image, imageIndex) => (imageIndex === index ? { ...image, productName } : image)));
  };

  const removeDraftImage = (index: number) => {
    setDraftImages((current) => current.filter((_, imageIndex) => imageIndex !== index));
  };

  const saveMaterialSection = async () => {
    if (!editingSection) {
      return;
    }

    const hasMissingName = draftImages.some((image) => !image.productName.trim());
    if (hasMissingName) {
      setSaveError("每张图片都需要填写产品名称。");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const saveResponse = await fetch("/api/materials/image-assets", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: editingSection.id,
          images: draftImages.map((image) => ({
            id: image.id,
            productName: image.productName.trim(),
            imageUrl: image.imageUrl,
            fileName: image.fileName,
            uploadedAt: image.uploadedAt,
            dataUrl: image.dataUrl,
          })),
        }),
      });

      if (!saveResponse.ok) {
        const payload = await saveResponse.json().catch(() => null);
        throw new Error(payload?.error ?? `保存失败（${saveResponse.status}）`);
      }

      const result = await saveResponse.json();
      if (Array.isArray(result.materials)) {
        setMaterials(result.materials);
      }
      setEditingSection(null);
      setDraftImages([]);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "保存失败，请稍后重试。");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadMore = async (section: MaterialSection & { industry?: IndustryId }) => {
    setLoadingSectionId(section.id);
    try {
      const allItems = [...section.items, ...(expandedItems[section.id] ?? [])];
      const response = await fetch("/api/materials/expand-phrases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionTitle: section.title,
          existingItems: allItems,
          industry: activeIndustry,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error ?? `AI 生成失败（${response.status}）`);
      }

      const result = await response.json();
      const newPhrases: string[] = Array.isArray(result.items) ? result.items.map((s: string) => String(s).trim()).filter(Boolean) : [];

      if (newPhrases.length > 0) {
        setExpandedItems((prev) => ({
          ...prev,
          [section.id]: [...(prev[section.id] ?? []), ...newPhrases],
        }));
        setCollapsedSections((prev) => ({ ...prev, [section.id]: false }));
      }
    } catch (caught) {
      alert("AI 生成失败，请稍后重试");
    } finally {
      setLoadingSectionId(null);
    }
  };

  const toggleCollapse = (sectionId: string) => {
    setCollapsedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const resolveItems = (section: MaterialSection & { industry?: IndustryId }): string[] => {
    const extra = expandedItems[section.id];
    return extra ? [...section.items, ...extra] : section.items;
  };

  const getExtraCount = (sectionId: string): number => {
    return (expandedItems[sectionId] ?? []).length;
  };

  return (
    <>
    <section className="template-grid">
      {materials
        .filter((section) => !section.industry || section.industry === activeIndustry)
        .map((section) => {
          const items = resolveItems(section);
          const extraCount = getExtraCount(section.id);
          const isCollapsed = collapsedSections[section.id] ?? false;
          const hasExtra = extraCount > 0;
          const visibleItems = hasExtra && isCollapsed ? section.items : items;
          const isLoading = loadingSectionId === section.id;
          const isEditableMaterial = editableMaterialTitles.has(section.title);
          return (
        <article className="panel material-card" key={section.id}>
          <div className="section-heading">
            <h2>{adaptIndustryText(section.title, industryProfile)}</h2>
            <BookOpenText size={18} aria-hidden="true" />
          </div>
          <p>{adaptIndustryText(section.description, industryProfile)}</p>
          <ul>
            {visibleItems.map((item) => (
              <li key={item}>{adaptIndustryText(item, industryProfile)}</li>
            ))}
          </ul>
          {isEditableMaterial && section.images?.length ? (
            <div className="material-image-grid">
              {section.images.map((image) => (
                <figure className="material-image-card" key={image.id}>
                  <img alt={image.productName} src={image.imageUrl} />
                  <figcaption>{image.productName}</figcaption>
                </figure>
              ))}
            </div>
          ) : null}
          <div className="material-actions">
            {hasExtra ? (
              <button
                className="ghost-button"
                onClick={() => toggleCollapse(section.id)}
                type="button"
              >
                <span>{isCollapsed ? `展开 (${extraCount}条)` : "收起"}</span>
              </button>
            ) : null}
            {isEditableMaterial ? (
              <button
                className="ghost-button"
                onClick={() => openMaterialEditor(section)}
                title="上传并编辑本地素材"
                type="button"
              >
                <Upload size={14} aria-hidden="true" />
                <span>上传本地资料</span>
              </button>
            ) : (
              <button
                className="ghost-button"
                disabled={isLoading}
                onClick={() => handleLoadMore(section)}
                title="AI 生成更多内容"
                type="button"
              >
                {isLoading ? (
                  <Loader2 className="spin-icon" size={14} aria-hidden="true" />
                ) : (
                  <Sparkles size={14} aria-hidden="true" />
                )}
                <span>{isLoading ? "生成中" : "加载更多"}</span>
              </button>
            )}
          </div>
        </article>
          );
        })}
    </section>
    {editingSection ? (
      <div className="material-editor-backdrop" role="presentation" onMouseDown={closeMaterialEditor}>
        <section
          aria-labelledby="material-editor-title"
          aria-modal="true"
          className="material-editor-dialog"
          onMouseDown={(event) => event.stopPropagation()}
          role="dialog"
        >
          <div className="section-heading">
            <div>
              <h2 id="material-editor-title">{adaptIndustryText(editingSection.title, industryProfile)}</h2>
              <span>上传图片资料，并为每张图片填写产品名称</span>
            </div>
            <button className="icon-button" onClick={closeMaterialEditor} title="关闭" type="button">
              <X size={18} aria-hidden="true" />
              <span>关闭</span>
            </button>
          </div>

          <div className="material-upload-panel">
            <label className="material-file-button">
              <Upload size={16} aria-hidden="true" />
              <span>选择图片</span>
              <input accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={handleImageFileChange} type="file" />
            </label>
            <p>支持 jpg、png、webp、gif，单张不超过 5MB。选择后先预览，点击保存后写入素材库。</p>
          </div>

          <div className="material-editor-list" aria-label="图片素材编辑列表">
            {draftImages.length > 0 ? (
              draftImages.map((image, index) => (
              <div className="material-editor-row" key={image.id}>
                <img alt={image.productName || "待命名图片素材"} src={image.previewUrl} />
                <label>
                  <span>产品名称</span>
                  <input
                    aria-label={`产品名称 ${index + 1}`}
                    onChange={(event) => updateDraftImageName(index, event.target.value)}
                    placeholder="填写产品名称"
                    value={image.productName}
                  />
                </label>
                <button className="icon-button danger" onClick={() => removeDraftImage(index)} title="删除图片" type="button">
                  <Trash2 size={16} aria-hidden="true" />
                  <span>删除</span>
                </button>
              </div>
              ))
            ) : (
              <div className="material-editor-empty">
                <strong>还没有图片资料</strong>
                <span>点击上方“选择图片”上传本地产品图、门店图或案例图。</span>
              </div>
            )}
          </div>

          {saveError ? <p className="material-editor-error">{saveError}</p> : null}

          <div className="material-editor-footer">
            <button className="command-button ghost" disabled={isSaving} onClick={closeMaterialEditor} type="button">
              取消
            </button>
            <button className="command-button primary" disabled={isSaving} onClick={saveMaterialSection} type="button">
              {isSaving ? <Loader2 className="spin-icon" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
              <span>{isSaving ? "保存中" : "保存素材"}</span>
            </button>
          </div>
        </section>
      </div>
    ) : null}
    </>
  );
}

function ReviewsView({
  activeIndustry,
  industryProfile,
  reviews,
}: {
  activeIndustry: IndustryId;
  industryProfile: IndustryProfile;
  reviews: ReviewRecord[];
}) {
  const visibleReviews = reviews.filter((review) => getReviewIndustry(review) === activeIndustry);

  return (
    <section className="panel table-panel">
      <div className="section-heading">
        <h2>{industryProfile.label}发布数据复盘</h2>
        <span>播放、互动、转化和复盘结论</span>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>关联选题</th>
              <th>日期</th>
              <th>平台</th>
              <th>播放</th>
              <th>点赞</th>
              <th>收藏</th>
              <th>评论</th>
              <th>转化</th>
              <th>复盘结论</th>
            </tr>
          </thead>
          <tbody>
            {visibleReviews.map((record) => (
              <tr key={record.id}>
                <td>{record.topicTitle}</td>
                <td>{record.publishDate}</td>
                <td>{record.platform}</td>
                <td>{formatNumber(record.views)}</td>
                <td>{formatNumber(record.likes)}</td>
                <td>{formatNumber(record.saves)}</td>
                <td>{formatNumber(record.comments)}</td>
                <td>{formatNumber(record.conversions)}</td>
                <td>{record.conclusion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function DecisionCard({
  actionLabel,
  badge,
  body,
  isActionLoading,
  meta,
  onAction,
  priority,
  title,
}: {
  actionLabel?: string;
  badge: string;
  body: string;
  isActionLoading?: boolean;
  meta: string;
  onAction?: () => void;
  priority: "高" | "中" | "低";
  title: string;
}) {
  return (
    <article className="decision-card">
      <div className="decision-card-top">
        <span>{badge}</span>
        <b className={`priority-pill priority-${priority}`}>{priority}优先级</b>
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      <small>{meta}</small>
      {onAction ? (
        <button className="inline-ai-button" disabled={isActionLoading} onClick={onAction} type="button">
          {isActionLoading ? <Loader2 className="spin-icon" size={14} aria-hidden="true" /> : null}
          <span>{actionLabel ?? "AI 研判"}</span>
        </button>
      ) : null}
    </article>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ProgressRow({ label, value, max }: { label: string; value: number; max: number }) {
  const percent = Math.min(100, Math.round((value / max) * 100));
  return (
    <div className="progress-row">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export default App;
