"use client";

/**
 * AuthProvider — context xác thực cho toàn bộ dashboard.
 *
 * - Lưu JWT + thông tin user vào localStorage để giữ phiên qua các lần tải lại.
 * - Cung cấp login()/logout() và trạng thái user hiện tại.
 * - Backend không có endpoint /api/me, nên ta lưu luôn user object trả về từ
 *   /api/auth/login và rehydrate từ localStorage khi mount.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { ApiError, apiFetch, setToken, getToken } from "@/lib/api";

export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "approved" | "locked";

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
}

interface LoginResponse {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Đang khôi phục phiên từ localStorage (tránh nháy UI lúc mount). */
  loading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<AuthUser>;
  logout: () => void;
}

const USER_KEY = "gr_user";

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeStoredUser(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  } else {
    window.localStorage.removeItem(USER_KEY);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Khôi phục phiên: chỉ coi là đăng nhập khi có cả token lẫn user.
  useEffect(() => {
    const token = getToken();
    const stored = readStoredUser();
    if (token && stored) {
      setUser(stored);
    } else {
      // Dọn trạng thái lệch (có cái này thiếu cái kia).
      setToken(null);
      writeStoredUser(null);
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiFetch<LoginResponse>("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(data.token);
    writeStoredUser(data.user);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    writeStoredUser(null);
    setUser(null);
  }, []);

  const value: AuthContextValue = {
    user,
    loading,
    isAuthenticated: user !== null,
    isAdmin: user?.role === "admin",
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook truy cập context; ném lỗi nếu dùng ngoài AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth phải được dùng bên trong <AuthProvider>");
  }
  return ctx;
}

// Re-export để các component xử lý lỗi đăng nhập (403 chờ duyệt/khóa).
export { ApiError };
