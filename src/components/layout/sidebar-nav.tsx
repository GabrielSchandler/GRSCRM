"use client";

import {
  BarChart3,
  Building2,
  Calculator,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  FileText,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  Mail,
  MessageCircle,
  MessagesSquare,
  WalletCards,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WORKSPACE_COOKIE_NAME, type WorkspaceView } from "@/lib/workspace";

export type SidebarNavigationItem = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "approvals"
    | "clients"
    | "preSales"
    | "calculations"
    | "documents"
    | "templates"
    | "contracts"
    | "users"
    | "company"
    | "backups"
    | "logs"
    | "email"
    | "integrations"
    | "leads"
    | "legal"
    | "finance"
    | "academy"
    | "chat"
    | "internalChat";
  managerOnly?: boolean;
  adminOnly?: boolean;
};

type SidebarNavProps = {
  items: SidebarNavigationItem[];
  canManageTemplates: boolean;
  workspace: WorkspaceView;
  /** Menu do computador só com ícones: o nome aparece quando o menu abre (passar o mouse). */
  compacto?: boolean;
  tone?: "light" | "dark";
};

const icons = {
  dashboard: LayoutDashboard,
  approvals: ClipboardCheck,
  clients: Users,
  preSales: Handshake,
  calculations: Calculator,
  documents: FileText,
  templates: FileText,
  contracts: FileSignature,
  users: BarChart3,
  company: Building2,
  backups: ClipboardList,
  logs: ClipboardList,
  email: Mail,
  integrations: Mail,
  leads: ClipboardList,
  legal: FileText,
  finance: WalletCards,
  academy: GraduationCap,
  chat: MessagesSquare,
  internalChat: MessageCircle,
};

function isActivePath(pathname: string, href: string) {
  if (href === "/documentos") {
    return pathname === href || pathname.startsWith("/documentos/gerados");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarNav({
  items,
  canManageTemplates,
  workspace,
  compacto = false,
  tone = "light",
}: SidebarNavProps) {
  const pathname = usePathname();

  function persistWorkspacePreference() {
    document.cookie = `${WORKSPACE_COOKIE_NAME}=${workspace}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`;
  }

  return (
    <nav className={`flex flex-1 flex-col gap-1 ${compacto ? "min-w-0" : ""}`}>
      {items.map((item) => {
        if (item.managerOnly && !canManageTemplates) {
          return null;
        }

        const Icon = icons[item.icon];
        const active = isActivePath(pathname, item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            onClick={persistWorkspacePreference}
            title={compacto ? item.label : undefined}
            className={`inline-flex items-center gap-3 rounded-[10px] ${compacto ? "min-w-0 overflow-hidden px-4" : "px-3"} py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5267F5] focus-visible:ring-offset-2 ${
              tone === "dark"
                ? active
                  ? "bg-[#5267F5] text-white focus-visible:ring-offset-[#10172F]"
                  : "text-[#C8D1E3] hover:bg-white/5 hover:text-white focus-visible:ring-offset-[#10172F]"
                : active
                  ? "bg-[#E9ECFF] text-[#4053DE]"
                  : "text-slate-700 hover:bg-[#EEF1F8] hover:text-[#11182E]"
            }`}
          >
            <Icon
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 ${tone === "dark" ? "text-current" : active ? "text-[#4053DE]" : "text-[#69738A]"}`}
            />
            {compacto ? <span className="min-w-0 truncate whitespace-nowrap">{item.label}</span> : item.label}
          </Link>
        );
      })}
    </nav>
  );
}
