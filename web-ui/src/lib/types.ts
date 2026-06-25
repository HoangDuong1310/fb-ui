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
