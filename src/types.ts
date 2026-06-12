export type ScriptStatus = "未写" | "已写" | "已拍" | "已发";
export type IndustryId = "hotpot" | "bbq";

export type IndustryQuickStat = {
  label: string;
  value: string;
  detail: string;
};

export type IndustryHeroTopic = {
  title: string;
  targetUser: string;
  contentType: string;
  productAssociation: string;
  platform: string;
};

export type IndustryWorkflowStep = {
  icon: string;
  title: string;
  detail: string;
};

export type IndustryAssetCard = {
  title: string;
  detail: string;
  count: string;
  updated: string;
};

export type IndustryPlanEntry = {
  day: string;
  theme: string;
  output: string;
};

export type IndustryProfile = {
  id: IndustryId;
  label: string;
  name: string;
  audience: string;
  promise: string;
  style: string;
  platforms: string[];
  conversionGoal: string;
  columns: string[];
  quickTopics: string[];
  defaultTopicCandidate: {
    category: TopicCategory;
    query: string;
    targetUser: string;
    column: string;
  };
  defaultResearch: {
    query: string;
    targetUser: string;
    column: string;
  };
  dashboard: {
    kicker: string;
    subtitle: string;
    heroTitle: string;
    heroDescription: string;
    heroTopic: IndustryHeroTopic;
    stats: IndustryQuickStat[];
    workflowSteps: IndustryWorkflowStep[];
    assetCards: IndustryAssetCard[];
    weeklyPlan: IndustryPlanEntry[];
  };
  searchKeywords: {
    dashboardDecision: string;
    hotspotMatch: string;
    topicExpand: string;
    materialSuggestion: string;
    general: string;
    candidate: string;
  };
};

export type TopicCategory =
  | "行业热点选题"
  | "节气节日选题"
  | "产品种草选题"
  | "B端经营选题"
  | "用户痛点选题"
  | "爆品打造选题"
  | "系列化选题";

export type Topic = {
  id: string;
  title: string;
  column: string;
  topicCategory: TopicCategory;
  industry?: IndustryId;
  contentType: string;
  targetUser: string;
  painPoint: string;
  businessLink: string;
  hotSource: string;
  angle: string;
  coreView: string;
  platform: string;
  format: string;
  scriptStatus: ScriptStatus;
  publishData: {
    views: number;
    likes: number;
    saves: number;
    comments: number;
    conversions: number;
  };
  review: string;
  sourceUrls?: string[];
  recommendationScore?: number;
  aiGenerated?: boolean;
  riskNotes?: string[];
};

export type Positioning = {
  name: string;
  audience: string;
  promise: string;
  style: string;
  platforms: string[];
  conversionGoal: string;
};

export type ScriptTemplate = {
  id: string;
  name: string;
  scenario: string;
  steps: string[];
  opener: string;
  platforms: string[];
  industry?: IndustryId;
};

export type PromptTemplate = {
  id: string;
  purpose: string;
  audience: string;
  body: string;
  outputFields: string[];
  industry?: IndustryId;
};

export type MaterialImage = {
  id: string;
  productName: string;
  imageUrl: string;
  fileName: string;
  uploadedAt: string;
};

export type MaterialSection = {
  id: string;
  title: string;
  description: string;
  items: string[];
  images?: MaterialImage[];
  industry?: IndustryId;
};

export type ReviewRecord = {
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
  industry?: IndustryId;
};

export type ProductionStep =
  | "topic"
  | "research"
  | "template"
  | "script"
  | "materials"
  | "publish"
  | "review";

export type ScriptDraft = {
  opener: string;
  structure: string;
  ending: string;
  voiceover: string;
};

export type PublishDraft = {
  title: string;
  description: string;
  hashtags: string[];
  platformCopies: Array<{ platform: string; copy: string }>;
};

export type ProductionReviewDraft = {
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

export type ContentProduction = {
  topicId: string;
  industry?: IndustryId;
  currentStep: ProductionStep;
  researchNotes: string;
  selectedTemplateId: string;
  scriptDraft: ScriptDraft;
  matchedMaterials: {
    productImages: string[];
    storeScenes: string[];
    foodShots: string[];
    coverReferences: string[];
  };
  publishDraft: PublishDraft;
  reviewDraft: ProductionReviewDraft;
  updatedAt: string;
};

export type HotspotOpportunity = {
  id: string;
  title: string;
  type: string;
  window: string;
  matchedColumn: string;
  targetUser: string;
  recommendedAngle: string;
  priority: "高" | "中" | "低";
  industry?: IndustryId;
};

export type IterationSuggestion = {
  id: string;
  type: string;
  related: string;
  action: string;
  reason: string;
  output: string;
  industry?: IndustryId;
};

export type PriorityTopic = {
  id: string;
  title: string;
  priority: "高" | "中" | "低";
  reason: string;
  source: string;
  industry?: IndustryId;
};

export type ResearchFreshness = "noLimit" | "oneDay" | "oneWeek" | "oneMonth" | "oneYear";
export type ResearchMode = "general" | "dashboardDecision" | "hotspotMatch" | "topicExpand" | "materialSuggestion";

export type ResearchRequest = {
  mode?: ResearchMode;
  industry?: IndustryId;
  query: string;
  targetUser: string;
  column: string;
  freshness: ResearchFreshness;
  notes: string;
};

export type ResearchSource = {
  title: string;
  url: string;
  siteName: string;
  snippet: string;
  summary?: string;
  datePublished?: string;
};

export type ResearchTopicIdea = {
  title: string;
  targetUser: string;
  angle: string;
  coreView: string;
  platform: string;
  format: string;
};

export type ResearchResult = {
  id: string;
  createdAt: string;
  request: ResearchRequest;
  summary: string;
  matchScore: "高" | "中" | "低";
  matchedReason: string;
  angles: string[];
  topicIdeas: ResearchTopicIdea[];
  risks: string[];
  sources: ResearchSource[];
};

export type GeneratedTopicCandidate = {
  id: string;
  title: string;
  industry?: IndustryId;
  topicCategory: TopicCategory;
  targetUser: string;
  painPoint: string;
  hotSource: string;
  angle: string;
  coreView: string;
  businessLink: string;
  platform: string;
  format: string;
  sourceUrls: string[];
  recommendationScore: number;
  risks: string[];
};

export type TopicCandidateGenerateRequest = {
  industry?: IndustryId;
  category: TopicCategory;
  query: string;
  targetUser: string;
  column: string;
  freshness: ResearchFreshness;
  notes: string;
  limit: number;
};

export type TopicCandidateGenerateResult = {
  id: string;
  createdAt: string;
  request: TopicCandidateGenerateRequest;
  candidates: GeneratedTopicCandidate[];
  sources: ResearchSource[];
  warning?: string;
};

export type TopicRefreshRequest = {
  industry?: IndustryId;
  query: string;
  column: string;
  sourceFilter: string;
  contentStatus: string;
  limit?: number;
};

export type ContentData = {
  positioning: Positioning;
  industryProfiles: IndustryProfile[];
  columns: string[];
  topics: Topic[];
  scriptTemplates: ScriptTemplate[];
  prompts: PromptTemplate[];
  materials: MaterialSection[];
  hotspots: HotspotOpportunity[];
  iterationSuggestions: IterationSuggestion[];
  priorityTopics: PriorityTopic[];
  reviews: ReviewRecord[];
  topicCategories: TopicCategory[];
  productions: ContentProduction[];
};
