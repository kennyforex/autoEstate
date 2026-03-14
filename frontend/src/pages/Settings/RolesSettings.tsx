import React from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Check, X } from 'lucide-react';
import { Badge } from '../../components/common';

interface Permission {
  nameKey: string;
  descKey: string;
  admin: boolean;
  agent: boolean;
  viewer: boolean;
}

const permissionKeys: Permission[] = [
  { nameKey: 'manageTeam', descKey: 'manageTeamDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'manageChannels', descKey: 'manageChannelsDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'manageAssistants', descKey: 'manageAssistantsDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'configureAI', descKey: 'configureAIDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'manageAPIKeys', descKey: 'manageAPIKeysDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'manageWebhooks', descKey: 'manageWebhooksDesc', admin: true, agent: false, viewer: false },
  { nameKey: 'viewInbox', descKey: 'viewInboxDesc', admin: true, agent: true, viewer: true },
  { nameKey: 'handleConversations', descKey: 'handleConversationsDesc', admin: true, agent: true, viewer: false },
  { nameKey: 'manageTags', descKey: 'manageTagsDesc', admin: true, agent: true, viewer: false },
  { nameKey: 'viewDashboard', descKey: 'viewDashboardDesc', admin: true, agent: true, viewer: true },
  { nameKey: 'viewAILogs', descKey: 'viewAILogsDesc', admin: true, agent: true, viewer: true },
  { nameKey: 'editCompany', descKey: 'editCompanyDesc', admin: true, agent: false, viewer: false },
];

export const RolesSettings: React.FC = () => {
  const { t } = useTranslation();

  const roles = [
    {
      name: t('roles.admin.name'),
      description: t('roles.admin.description'),
      variant: 'purple' as const,
    },
    {
      name: t('roles.agent.name'),
      description: t('roles.agent.description'),
      variant: 'info' as const,
    },
    {
      name: t('roles.viewer.name'),
      description: t('roles.viewer.description'),
      variant: 'default' as const,
    },
  ];

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">{t('roles.title')}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {t('roles.subtitle')}
        </p>
      </div>

      {/* Roles Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        {roles.map((role) => (
          <div key={role.name} className="bg-white border border-gray-200 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-gray-400" />
              <Badge variant={role.variant}>{role.name}</Badge>
            </div>
            <p className="text-sm text-gray-500">{role.description}</p>
          </div>
        ))}
      </div>

      {/* Permissions Matrix */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">{t('roles.matrix.title')}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                  {t('roles.matrix.permission')}
                </th>
                <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  {t('roles.admin.name')}
                </th>
                <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  {t('roles.agent.name')}
                </th>
                <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
                  {t('roles.viewer.name')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {permissionKeys.map((permission) => (
                <tr key={permission.nameKey} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">
                      {t(`roles.permissions.${permission.nameKey}`)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t(`roles.permissions.${permission.descKey}`)}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permission.admin ? (
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permission.agent ? (
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {permission.viewer ? (
                      <Check className="w-5 h-5 text-green-500 mx-auto" />
                    ) : (
                      <X className="w-5 h-5 text-gray-300 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Note */}
      <div className="mt-6 p-4 bg-white border border-gray-200 rounded-xl">
        <p className="text-sm text-gray-600">
          <strong className="text-gray-900">Note:</strong> {t('roles.note')}
        </p>
      </div>
    </div>
  );
};
