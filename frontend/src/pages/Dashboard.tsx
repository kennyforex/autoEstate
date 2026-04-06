import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Sparkles,
  Clock,
  RefreshCw,
  AlertTriangle,
  Frown,
  Zap,
  Target,
  TrendingUp,
  Phone,
  Bot,
  Users,
  BarChart3,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { PageHeader } from '../components/layout';
import { Button, Select } from '../components/common';
import { dashboardApi } from '../lib/api';
import type { DashboardMetrics, AIInsights, ChannelStats, AIPerformanceMetrics } from '../lib/types';

const MetricCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
}> = ({ icon, label, value, subtext }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-5">
    <div className="flex items-center justify-between mb-3">
      <span className="text-sm font-medium text-gray-500">{label}</span>
      <span className="text-gray-400">{icon}</span>
    </div>
    <p className="text-2xl font-semibold text-gray-900">{value}</p>
    {subtext && (
      <p className="text-sm text-gray-500 mt-1">{subtext}</p>
    )}
  </div>
);

const StatItem: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string | number;
}> = ({ icon, label, value }) => (
  <div className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
    <div className="flex items-center gap-3">
      <span className="text-gray-400">{icon}</span>
      <span className="text-sm text-gray-600">{label}</span>
    </div>
    <span className="text-sm font-semibold text-gray-900">{value}</span>
  </div>
);

// Monochrome chart colors
const CHART_COLORS = ['#374151', '#6B7280', '#9CA3AF', '#D1D5DB'];
const ACCENT_COLOR = '#84CC16'; // Lime green for bar chart accent

/**
 * Convert timeRange value to startDate/endDate for API
 */
const getDateRangeFromTimeRange = (timeRange: string): { startDate: string; endDate: string } => {
  const now = new Date();
  const endDate = now.toISOString();
  
  let startDate: Date;
  switch (timeRange) {
    case 'today':
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case '7days':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30days':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }
  
  return { startDate: startDate.toISOString(), endDate };
};

/**
 * Format date for chart display
 */
const formatChartDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [channelStats, setChannelStats] = useState<ChannelStats[]>([]);
  const [aiPerformance, setAiPerformance] = useState<AIPerformanceMetrics | null>(null);
  const [timeRange, setTimeRange] = useState('30days');
  const [isLoading, setIsLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const dateRange = getDateRangeFromTimeRange(timeRange);
      
      const [metricsData, insightsData, channelStatsData, aiPerformanceData] = await Promise.all([
        dashboardApi.getMetrics(dateRange),
        dashboardApi.getInsights(),
        dashboardApi.getChannelStats(),
        dashboardApi.getAIPerformance(dateRange),
      ]);
      setMetrics(metricsData);
      setInsights(insightsData);
      setChannelStats(channelStatsData);
      setAiPerformance(aiPerformanceData);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatResponseTime = (minutes: number): string => {
    if (minutes < 1) return '<1m';
    if (minutes < 60) return `${Math.round(minutes)}m`;
    return `${Math.round(minutes / 60)}h`;
  };

  // Build pie data with real statuses
  const pieData = metrics
    ? [
        { name: t('dashboard.resolved'), value: metrics.conversationsByStatus?.['resolved'] || 0 },
        { name: t('dashboard.open'), value: metrics.conversationsByStatus?.['open'] || 0 },
        { name: t('dashboard.spam'), value: metrics.conversationsByStatus?.['spam'] || 0 },
      ].filter(item => item.value > 0)
    : [];

  // Format trend data for bar chart
  const chartData = (metrics?.conversationsTrend || []).map(item => ({
    ...item,
    date: formatChartDate(item.date),
  }));

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <PageHeader
        title={t('dashboard.title')}
        actions={
          <div className="flex items-center gap-3">
            <Select
              value={timeRange}
              onChange={setTimeRange}
              options={[
                { value: 'today', label: t('dashboard.today') },
                { value: '7days', label: t('dashboard.last7Days') },
                { value: '30days', label: t('dashboard.last30Days') },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              leftIcon={<RefreshCw className="w-4 h-4" />}
            >
              {t('dashboard.refresh')}
            </Button>
          </div>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-4 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <MetricCard
              icon={<MessageSquare className="w-5 h-5" />}
              label={t('dashboard.totalConversations')}
              value={metrics?.totalConversations || 0}
            />
            <MetricCard
              icon={<Sparkles className="w-5 h-5" />}
              label={t('dashboard.resolved')}
              value={metrics?.conversationsByStatus?.['resolved'] || 0}
              subtext={`${metrics?.totalConversations ? Math.round(((metrics?.conversationsByStatus?.['resolved'] || 0) / metrics.totalConversations) * 100) : 0}% ${t('dashboard.resolutionRate')}`}
            />
            <MetricCard
              icon={<Clock className="w-5 h-5" />}
              label={t('dashboard.avgResponseTime')}
              value={formatResponseTime(metrics?.avgResponseTime || 0)}
            />
            <MetricCard
              icon={<Users className="w-5 h-5" />}
              label={t('dashboard.openConversations')}
              value={metrics?.conversationsByStatus?.['open'] || 0}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Conversation Volume Chart */}
            <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {t('dashboard.overview')}
              </h3>
              <div className="relative z-0 h-[280px] overflow-hidden">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} accessibilityLayer={false}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: '#6B7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: '#6B7280' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: '#fff',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Bar
                      dataKey="count"
                      fill={ACCENT_COLOR}
                      radius={[4, 4, 0, 0]}
                      name={t('dashboard.conversations')}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Status Distribution */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {t('dashboard.statusDistribution')}
              </h3>
              {pieData.length > 0 ? (
                <>
                  <div className="relative z-0 h-[180px] overflow-hidden">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart accessibilityLayer={false}>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={70}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={CHART_COLORS[index % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          cursor={false}
                          contentStyle={{
                            backgroundColor: '#fff',
                            border: '1px solid #E5E7EB',
                            borderRadius: '8px',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-2 mt-2">
                    {pieData.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                          />
                          <span className="text-sm text-gray-600">{item.name}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-[200px] text-gray-400">
                  {t('dashboard.noData')}
                </div>
              )}
            </div>
          </div>

          {/* AI Insights & Performance Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* AI Insights */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {t('dashboard.aiInsights')}
              </h3>
              <div className="space-y-0">
                <StatItem
                  icon={<Zap className="w-4 h-4" />}
                  label={t('dashboard.priorityItems')}
                  value={insights?.aiPriority || 0}
                />
                <StatItem
                  icon={<Frown className="w-4 h-4" />}
                  label={t('dashboard.negativeSentiment')}
                  value={insights?.negativeSentiment || 0}
                />
                <StatItem
                  icon={<AlertTriangle className="w-4 h-4" />}
                  label={t('dashboard.slaRisk')}
                  value={insights?.slaRisk || 0}
                />
              </div>
            </div>

            {/* AI Performance */}
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {t('dashboard.aiPerformance')}
              </h3>
              <div className="space-y-0">
                <StatItem
                  icon={<Bot className="w-4 h-4" />}
                  label={t('dashboard.totalAIResponses')}
                  value={aiPerformance?.totalResponses || 0}
                />
                <StatItem
                  icon={<Target className="w-4 h-4" />}
                  label={t('dashboard.avgConfidence')}
                  value={aiPerformance?.avgConfidence ? `${Math.round(aiPerformance.avgConfidence * 100)}%` : 'N/A'}
                />
                <StatItem
                  icon={<TrendingUp className="w-4 h-4" />}
                  label={t('dashboard.resolutionRateLabel')}
                  value={aiPerformance?.resolutionRate ? `${aiPerformance.resolutionRate}%` : '0%'}
                />
                <StatItem
                  icon={<BarChart3 className="w-4 h-4" />}
                  label={t('dashboard.escalationRate')}
                  value={aiPerformance?.escalationRate ? `${aiPerformance.escalationRate}%` : '0%'}
                />
              </div>
            </div>
          </div>

          {/* Channel Breakdown */}
          {channelStats.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">
                {t('dashboard.channels')}
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.channel')}</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.conversations')}</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.aiHandled')}</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.aiRate')}</th>
                      <th className="text-right py-3 px-4 text-xs font-medium text-gray-500 uppercase tracking-wider">{t('dashboard.avgResponse')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {channelStats.map((channel) => (
                      <tr key={channel.channelId} className="hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-gray-400" />
                            <span className="text-sm font-medium text-gray-900">{channel.channelName}</span>
                          </div>
                        </td>
                        <td className="text-right py-3 px-4 text-sm text-gray-600">{channel.totalConversations}</td>
                        <td className="text-right py-3 px-4 text-sm text-gray-600">{channel.aiHandled}</td>
                        <td className="text-right py-3 px-4 text-sm text-gray-600">
                          {channel.totalConversations > 0
                            ? `${Math.round((channel.aiHandled / channel.totalConversations) * 100)}%`
                            : '0%'}
                        </td>
                        <td className="text-right py-3 px-4 text-sm text-gray-600">
                          {channel.avgResponseTime > 0 ? formatResponseTime(channel.avgResponseTime) : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
