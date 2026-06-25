/**
 * Kiểu dữ liệu khớp với response của Express API (web/routes.js).
 * Chỉ khai báo các trường client thực sự dùng.
 */

export interface StatsGroup {
  groupId: string;
  groupName: string;
  count: number;
}

export interface StatsResponse {
  total: number;
  groups: StatsGroup[];
}

export interface Group {
  groupId: string;
  groupName: string | null;
  crawledBy: number | null;
  createdAt: string;
  updatedAt: string;
  postCount: number;
}

export interface GroupsResponse {
  groups: Group[];
}

export interface Post {
  postId: string;
  groupId: string;
  groupName: string | null;
  authorName: string | null;
  authorProfile: string | null;
  text?: string | null;
  permalink?: string | null;
  timestamp?: string | null;
  crawledAt?: string | null;
}

export interface PostsResponse {
  posts: Post[];
}

export interface GroupPrice {
  id: number;
  postId: string;
  name: string | null;
  price: number | null;
  condition: string | null;
  warranty: string | null;
  category: string | null;
  sellerName: string | null;
  sellerProfile: string | null;
  groupId: string | null;
  postedAt: string | null;
  parsedAt: string | null;
  parser: string | null;
  confidence: number | null;
}

export interface GroupPricesResponse {
  groupPrices: GroupPrice[];
}

export interface AdminUser {
  id: number;
  email: string;
  displayName: string | null;
  role: "user" | "admin";
  status: "pending" | "approved" | "locked";
  createdAt: string;
}

export interface AdminUsersResponse {
  users: AdminUser[];
}

export interface AdminComment {
  id: number;
  postId: string;
  userId: number | null;
  content: string | null;
  commentedAt: string | null;
  shareCommented: boolean;
}

export interface AdminConversation {
  id: number;
  postId: string | null;
  status: string | null;
  groupName: string | null;
  myComment?: string | null;
  postText?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminAdvisory {
  id: number;
  postId: string | null;
  content: string | null;
  status: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface AdminUserOverview {
  user: AdminUser;
  counts: {
    posts: number;
    groups: number;
    comments: number;
    conversations: number;
    advisories: number;
    groupPrices: number;
  };
  sharePrefs: {
    shareCrawled: boolean;
    shareCommented: boolean;
    shareGroupPrices: boolean;
  } | null;
  posts: Post[];
  groups: Group[];
  comments: AdminComment[];
  conversations: AdminConversation[];
  advisories: AdminAdvisory[];
  groupPrices: GroupPrice[];
}

export interface RemoteCommand {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  status: string;
  result: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface RemoteCommandsResponse {
  commands: RemoteCommand[];
  total: number;
  page: number;
  limit: number;
}

/* ─── Per-user settings ─── */

export interface AiConfig {
  apiBase: string | null;
  apiBaseDefault: string | null;
  apiBaseEffective: string | null;
  model: string | null;
  modelDefault: string | null;
  modelEffective: string | null;
  hasKey: boolean;
  keyMasked: string | null;
}

export interface SharePrefs {
  shareCrawledDefault: boolean;
  shareCommentedDefault: boolean;
  shareGroupPricesDefault: boolean;
}

/* ─── Products ─── */

export interface Product {
  productId: string;
  source: string | null;
  name: string | null;
  price: number | null;
  url: string | null;
  category: string | null;
  raw: Record<string, unknown> | null;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface ProductsResponse {
  products: Product[];
}

/* ─── Sources ─── */

export interface Source {
  id: string;
  config: Record<string, unknown> | null;
  updatedAt: string | null;
}

export interface SourcesResponse {
  sources: Source[];
}

/* ─── Keywords ─── */

export interface Keyword {
  id: number;
  keyword: string;
  type: string;
  addedBy: number | null;
  enabled: boolean;
  createdAt: string | null;
}

export interface KeywordsResponse {
  keywords: Keyword[];
}

/* ─── Prompt Profiles ─── */

export interface PromptProfile {
  id: string;
  name: string | null;
  config: Record<string, unknown> | null;
  isActive: boolean;
  updatedAt: string | null;
}

export interface PromptProfilesResponse {
  profiles: PromptProfile[];
}

/* ─── Advisories (per-user) ─── */

export interface Advisory {
  id: number;
  postId: string;
  userId: number | null;
  content: string | null;
  status: string | null;
  usedProducts: Array<{
    productId?: string;
    name?: string;
    price?: number;
    url?: string;
    [key: string]: unknown;
  }>;
  needsHumanCheck: boolean;
  checkNote: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface AdvisoriesResponse {
  advisories: Advisory[];
}

/* ─── Conversations (per-user) ─── */

export interface Conversation {
  id: number;
  postId: string | null;
  userId: number | null;
  commentPermalink: string | null;
  commentId: string | null;
  replies: Array<{
    id?: string;
    text?: string;
    author?: string;
    permalink?: string;
    [key: string]: unknown;
  }>;
  status: string | null;
  postUrl: string | null;
  groupId: string | null;
  groupName: string | null;
  myComment: string | null;
  myCommentUrl: string | null;
  postText: string | null;
  draft: Record<string, unknown> | null;
  jobId: number | null;
  lastWatchedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface ConversationsResponse {
  conversations: Conversation[];
}

/* ─── AI Generation results ─── */

export interface AiClassifyResult {
  intent: string;
  language?: string;
  tone?: string;
  budget?: number | null;
  category?: string | null;
  confidence?: number;
  raw?: string;
}

export interface AiDraftResult {
  content: string;
  raw?: string;
}

export interface AiSpinResult {
  content: string;
  raw?: string;
}

export interface AiAnalyzeResult {
  advisory: Advisory;
  products: Product[];
  raw?: string;
}
