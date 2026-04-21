import React from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  User,
  Shield,
  Bell,
  Building,
  Users,
  Lock,
  Sparkles,
  BookOpen,
  Database,
  Key,
  Webhook,
  Mail,
  Truck,
} from "lucide-react";

export const SettingsLayout: React.FC = () => {
  const { t } = useTranslation();

  const navSections = [
    {
      title: t("settings.account.title"),
      items: [
        {
          path: "/settings/profile",
          label: t("settings.account.profile"),
          icon: <User className="w-4 h-4" />,
        },
        {
          path: "/settings/security",
          label: t("settings.account.security"),
          icon: <Shield className="w-4 h-4" />,
        },
        {
          path: "/settings/notifications",
          label: t("settings.account.notifications"),
          icon: <Bell className="w-4 h-4" />,
        },
      ],
    },
    {
      title: t("settings.workspace.title"),
      items: [
        {
          path: "/settings/general",
          label: t("settings.workspace.general"),
          icon: <Building className="w-4 h-4" />,
        },
        {
          path: "/settings/team",
          label: t("settings.workspace.teamMembers"),
          icon: <Users className="w-4 h-4" />,
        },
        {
          path: "/settings/roles",
          label: t("settings.workspace.rolesPermissions"),
          icon: <Lock className="w-4 h-4" />,
        },
        {
          path: "/settings/shipping",
          label: t("settings.workspace.shipping"),
          icon: <Truck className="w-4 h-4" />,
        },
      ],
    },
    {
      title: t("settings.aiConfiguration.title"),
      items: [
        {
          path: "/settings/ai-behavior",
          label: t("settings.aiConfiguration.aiBehavior"),
          icon: <Sparkles className="w-4 h-4" />,
        },
        {
          path: "/settings/knowledge-base",
          label: t("settings.aiConfiguration.knowledgeBase"),
          icon: <BookOpen className="w-4 h-4" />,
        },
        {
          path: "/settings/training",
          label: t("settings.aiConfiguration.trainingData"),
          icon: <Database className="w-4 h-4" />,
        },
      ],
    },
    {
      title: t("settings.integrations.title"),
      items: [
        {
          path: "/settings/smtp",
          label: t("settings.integrations.smtp"),
          icon: <Mail className="w-4 h-4" />,
        },
        {
          path: "/settings/api-keys",
          label: t("settings.integrations.apiKeys"),
          icon: <Key className="w-4 h-4" />,
        },
        {
          path: "/settings/webhooks",
          label: t("settings.integrations.webhooks"),
          icon: <Webhook className="w-4 h-4" />,
        },
      ],
    },
  ];

  return (
    <div className="flex h-screen">
      {/* Settings Navigation */}
      <div className="w-[240px] h-full bg-white border-r border-gray-200 overflow-y-auto scrollbar-thin">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">{t("settings.title")}</h2>
        </div>

        <nav className="p-2">
          {navSections.map((section) => (
            <div key={section.title} className="mb-4">
              <p className="px-3 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                {section.title}
              </p>
              {section.items.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                      isActive
                        ? "bg-gray-100 text-gray-900 font-medium"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    }`
                  }
                >
                  <span className="text-gray-400">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* Settings Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
};
