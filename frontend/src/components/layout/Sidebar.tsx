import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  LayoutDashboard,
  Mail,
  Sparkles,
  MessageCircle,
  Settings,
  ScrollText,
  Users,
  Plug2,
  Clock,
} from "lucide-react";
import { Avatar } from "../common/Avatar";
import { useAuth } from "../../context/AuthContext";
import { companyApi, conversationsApi } from "../../lib/api";
import {
  COMPANY_LOGO_UPDATED_EVENT,
  resolveLogoUrl,
} from "../../lib/resolveLogoUrl";
import { getSocket } from "../../lib/socket";

interface NavItem {
  path: string;
  icon: React.ReactNode;
  labelKey: string;
  badgeKey?: string;
}

const getNavItems = (): NavItem[] => [
  {
    path: "/dashboard",
    icon: <LayoutDashboard className="w-6 h-6" />,
    labelKey: "sidebar.dashboard",
  },
  {
    path: "/inbox",
    icon: <Mail className="w-6 h-6" />,
    labelKey: "sidebar.inbox",
    badgeKey: "inbox",
  },
  {
    path: "/ai-assistant",
    icon: <Sparkles className="w-6 h-6" />,
    labelKey: "sidebar.aiAssistant",
  },
  {
    path: "/ai-assistant/scheduled-tasks",
    icon: <Clock className="w-6 h-6" />,
    labelKey: "sidebar.scheduledTasks",
  },
  {
    path: "/channels",
    icon: <MessageCircle className="w-6 h-6" />,
    labelKey: "sidebar.channels",
  },
  {
    path: "/contacts",
    icon: <Users className="w-6 h-6" />,
    labelKey: "sidebar.contacts",
  },
  {
    path: "/ai-logs",
    icon: <ScrollText className="w-6 h-6" />,
    labelKey: "sidebar.aiLogs",
  },
  {
    path: "/integration",
    icon: <Plug2 className="w-6 h-6" />,
    labelKey: "sidebar.integration",
  },
  {
    path: "/settings",
    icon: <Settings className="w-6 h-6" />,
    labelKey: "sidebar.settings",
  },
];

export const Sidebar: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { user, logout, isAuthenticated } = useAuth();
  const navItems = getNavItems();
  const [inboxCount, setInboxCount] = useState(0);
  const [hasNewMessage, setHasNewMessage] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const [navLogoSrc, setNavLogoSrc] = useState("/favicon.png");

  useEffect(() => {
    if (!isAuthenticated) return;

    const loadCompanyLogo = async () => {
      try {
        const data = await companyApi.get();
        const resolved = resolveLogoUrl(data.logo);
        setNavLogoSrc(resolved || "/favicon.png");
      } catch {
        setNavLogoSrc("/favicon.png");
      }
    };

    loadCompanyLogo();
    window.addEventListener(COMPANY_LOGO_UPDATED_EVENT, loadCompanyLogo);
    return () =>
      window.removeEventListener(COMPANY_LOGO_UPDATED_EVENT, loadCompanyLogo);
  }, [isAuthenticated]);

  // Close profile menu when clicking outside
  useEffect(() => {
    if (!profileOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [profileOpen]);

  // Fetch inbox counts
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchCounts = async () => {
      try {
        const counts = await conversationsApi.getCounts();
        setInboxCount(counts.all || 0);
      } catch (error) {
        console.error("Failed to fetch inbox counts:", error);
      }
    };

    fetchCounts();

    // Listen for new messages via socket
    const socket = getSocket();
    if (socket) {
      const handleNewMessage = () => {
        setHasNewMessage(true);
        fetchCounts(); // Refresh counts
      };

      const handleConversationUpdate = () => {
        fetchCounts(); // Refresh counts on any update
      };

      socket.on("message:new", handleNewMessage);
      socket.on("conversation:update", handleConversationUpdate);

      return () => {
        socket.off("message:new", handleNewMessage);
        socket.off("conversation:update", handleConversationUpdate);
      };
    }
  }, [isAuthenticated]);

  // Clear new message indicator when visiting inbox
  useEffect(() => {
    if (location.pathname.startsWith("/inbox")) {
      setHasNewMessage(false);
    }
  }, [location.pathname]);

  const isActive = (path: string) => {
    const p = location.pathname;
    if (path === "/ai-assistant") {
      if (p === "/ai-assistant") return true;
      if (p.startsWith("/ai-assistant/scheduled-tasks")) return false;
      return /^\/ai-assistant\/[^/]+/.test(p);
    }
    if (path === "/ai-assistant/scheduled-tasks") {
      return p.startsWith("/ai-assistant/scheduled-tasks");
    }
    return p.startsWith(path);
  };

  const getBadge = (badgeKey?: string) => {
    if (badgeKey === "inbox") {
      return inboxCount > 0 ? inboxCount : undefined;
    }
    return undefined;
  };

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[72px] bg-dark flex flex-col items-center py-4 z-50">
      {/* Logo */}
      <NavLink
        to="/dashboard"
        className="w-10 h-10 rounded-lg flex items-center justify-center mb-8 overflow-hidden"
      >
        <img
          src={navLogoSrc}
          alt="Company logo"
          className="w-10 h-10 object-contain"
          onError={() => setNavLogoSrc("/favicon.png")}
        />
      </NavLink>

      {/* Navigation */}
      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={`
              relative w-12 h-12 flex items-center justify-center rounded-lg
              transition-colors group
              ${
                isActive(item.path)
                  ? "text-white bg-white/10"
                  : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
              }
            `}
            title={t(item.labelKey)}
          >
            {/* Active indicator */}
            {isActive(item.path) && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 bg-primary rounded-r" />
            )}

            {item.icon}

            {/* Badge */}
            {getBadge(item.badgeKey) && (
              <span
                className={`
                absolute top-1 right-1 min-w-[16px] h-4 bg-error text-white text-[10px] font-medium rounded-full flex items-center justify-center px-1
                ${hasNewMessage && item.badgeKey === "inbox" ? "animate-pulse" : ""}
              `}
              >
                {(getBadge(item.badgeKey) || 0) > 99
                  ? "99+"
                  : getBadge(item.badgeKey)}
              </span>
            )}

            {/* New message indicator dot */}
            {hasNewMessage &&
              item.badgeKey === "inbox" &&
              !isActive(item.path) && (
                <span className="absolute top-0 right-0 w-3 h-3 bg-success rounded-full animate-ping" />
              )}

            {/* Tooltip */}
            <div className="absolute left-full ml-3 px-2 py-1 bg-dark-surface text-white text-sm rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
              {t(item.labelKey)}
            </div>
          </NavLink>
        ))}
      </nav>

      {/* User Avatar */}
      <div className="relative" ref={profileRef}>
        <button
          type="button"
          onClick={() => setProfileOpen((open) => !open)}
          className="w-10 h-10 rounded-full overflow-hidden focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-dark"
        >
          <Avatar name={user?.name || "User"} src={user?.avatar} size="md" />
        </button>

        {/* Dropdown - click to open, stays open until outside click or Log out */}
        {profileOpen && (
          <div className="absolute left-full bottom-0 ml-3 py-2 bg-white rounded-lg shadow-lg min-w-[160px] z-[100]">
            <div className="px-4 py-2 border-b border-border">
              <p className="text-sm font-medium text-text-primary truncate">
                {user?.name}
              </p>
              <p className="text-xs text-text-secondary truncate">
                {user?.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setProfileOpen(false);
                logout();
              }}
              className="w-full px-4 py-2 text-left text-sm text-error hover:bg-gray-50"
            >
              {t("sidebar.logout")}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
