/**
 * nav.ts — defined dashboard navigation structure.
 *
 * NAV_GROUPS is read by AppSidebar to render the menu. Each item can mark
 * `adminOnly` to only show for admin accounts.
 */

import type { LucideIcon } from "lucide-react";
import {
  Database,
  FileSignature,
  FileText,
  Globe,
  Hammer,
  KeyRound,
  LayoutDashboard,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  Package,
  Send,
  Settings,
  Share2,
  Store,
  Tag,
  Terminal,
  UserCog,
  Users,
} from "lucide-react";

export interface NavItem {
  href: string;
  title: string;
  icon: LucideIcon;
  adminOnly?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      {
        href: "/",
        title: "Tổng quan",
        icon: LayoutDashboard,
      },
      {
        href: "/groups",
        title: "Nhóm",
        icon: Users,
      },
      {
        href: "/posts",
        title: "Bài viết",
        icon: FileText,
      },
      {
        href: "/group-prices",
        title: "Giá theo nhóm",
        icon: Tag,
      },
    ],
  },
  {
    label: "AI & Tự động",
    items: [
      {
        href: "/autopost",
        title: "Đăng bài tự động",
        icon: Send,
      },
      {
        href: "/autocomment",
        title: "Bình luận tự động",
        icon: MessageCircle,
      },
      {
        href: "/advisory",
        title: "Tư vấn bán hàng",
        icon: MessageSquare,
      },
      {
        href: "/conversations",
        title: "Cuộc trò chuyện",
        icon: MessagesSquare,
      },
    ],
  },
  {
    label: "Quản lý",
    items: [
      {
        href: "/products",
        title: "Sản phẩm",
        icon: Package,
      },
      {
        href: "/mystore",
        title: "Cửa hàng của tôi",
        icon: Store,
      },
      {
        href: "/build",
        title: "Xây bộ",
        icon: Hammer,
      },
      {
        href: "/sources",
        title: "Nguồn dữ liệu",
        icon: Globe,
      },
      {
        href: "/keywords",
        title: "Từ khóa",
        icon: KeyRound,
      },
      {
        href: "/sharing",
        title: "Chia sẻ dữ liệu",
        icon: Share2,
      },
      {
        href: "/profiles",
        title: "Hồ sơ ngành",
        icon: FileSignature,
      },
    ],
  },
  {
    label: "Điều khiển",
    items: [
      {
        href: "/remote-commands",
        title: "Lệnh từ Web",
        icon: Terminal,
      },
      {
        href: "/settings",
        title: "Cài đặt",
        icon: Settings,
      },
    ],
  },
  {
    label: "Quản trị",
    items: [
      {
        href: "/admin/data",
        title: "Sửa dữ liệu",
        icon: Database,
        adminOnly: true,
      },
      {
        href: "/admin/users",
        title: "Quản lý người dùng",
        icon: UserCog,
        adminOnly: true,
      },
    ],
  },
];
