import { Conversation, Message, Channel } from "../models/index.js";
import type { DashboardMetrics, AIInsights } from "../types/index.js";

class DashboardService {
  /**
   * Get dashboard metrics
   */
  async getMetrics(options?: {
    startDate?: Date;
    endDate?: Date;
    channelId?: string;
  }): Promise<DashboardMetrics> {
    const { startDate, endDate, channelId } = options || {};

    const dateFilter: Record<string, unknown> = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        (dateFilter.createdAt as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (dateFilter.createdAt as Record<string, Date>).$lte = endDate;
      }
    }

    const channelFilter = channelId ? { channelId } : {};
    const baseFilter = { ...dateFilter, ...channelFilter };

    // Get conversation counts
    const [totalConversations, aiResolved, resolvedConversations] =
      await Promise.all([
        Conversation.countDocuments(baseFilter),
        Conversation.countDocuments({ ...baseFilter, resolvedBy: "ai" }),
        Conversation.countDocuments({ ...baseFilter, status: "resolved" }),
      ]);

    // Calculate average response time (in minutes)
    const avgResponseTimeResult = await Message.aggregate([
      { $match: { sender: { $in: ["agent", "ai"] }, ...baseFilter } },
      {
        $lookup: {
          from: "messages",
          let: { convId: "$conversationId", created: "$createdAt" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$convId"] },
                    { $eq: ["$sender", "customer"] },
                    { $lt: ["$createdAt", "$$created"] },
                  ],
                },
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
          ],
          as: "previousCustomerMessage",
        },
      },
      { $unwind: "$previousCustomerMessage" },
      {
        $project: {
          responseTime: {
            $divide: [
              {
                $subtract: ["$createdAt", "$previousCustomerMessage.createdAt"],
              },
              60000, // Convert to minutes
            ],
          },
        },
      },
      {
        $group: {
          _id: null,
          avgResponseTime: { $avg: "$responseTime" },
        },
      },
    ]);

    const avgResponseTime = avgResponseTimeResult[0]?.avgResponseTime || 0;

    // Get conversations by status
    const statusCounts = await Conversation.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);

    const conversationsByStatus: Record<string, number> = {};
    for (const item of statusCounts) {
      conversationsByStatus[item._id] = item.count;
    }

    // Get conversation trend - use provided date range, or default to last 7 days
    const trendStartDate = startDate || (() => {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      return d;
    })();
    const trendEndDate = endDate || new Date();

    const trend = await Conversation.aggregate([
      {
        $match: {
          createdAt: { $gte: trendStartDate, $lte: trendEndDate },
          ...channelFilter,
        },
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const conversationsTrend = trend.map((item) => ({
      date: item._id,
      count: item.count,
    }));

    // Customer satisfaction (placeholder - would need feedback system)
    const customerSatisfaction = 4.2;

    return {
      totalConversations,
      aiResolved,
      avgResponseTime: Math.round(avgResponseTime * 10) / 10,
      customerSatisfaction,
      conversationsByStatus,
      conversationsTrend,
    };
  }

  /**
   * Get AI insights (excluding dismissed insights)
   */
  async getAIInsights(): Promise<AIInsights> {
    const [aiPriority, negativeSentiment, slaRisk] = await Promise.all([
      Conversation.countDocuments({
        status: "open",
        "aiSignals.priority": { $gte: 7 },
        $or: [
          { "dismissedInsights.priority": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
      Conversation.countDocuments({
        status: "open",
        "aiSignals.sentiment": "negative",
        $or: [
          { "dismissedInsights.negativeSentiment": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
      Conversation.countDocuments({
        status: "open",
        "aiSignals.slaRisk": true,
        $or: [
          { "dismissedInsights.slaRisk": { $ne: true } },
          { dismissedInsights: { $exists: false } },
        ],
      }),
    ]);

    return { aiPriority, negativeSentiment, slaRisk };
  }

  /**
   * Get channel statistics
   */
  async getChannelStats(): Promise<
    Array<{
      channelId: string;
      channelName: string;
      totalConversations: number;
      aiHandled: number;
      avgResponseTime: number;
    }>
  > {
    const channels = await Channel.find({ status: "connected" });

    const stats = await Promise.all(
      channels.map(async (channel) => {
        const channelIdFilter = { channelId: channel._id };

        const [totalConversations, aiHandled, avgResponseTimeResult] = await Promise.all([
          Conversation.countDocuments(channelIdFilter),
          Conversation.countDocuments({
            ...channelIdFilter,
            resolvedBy: "ai",
          }),
          // Calculate average response time for this channel (in minutes)
          Message.aggregate([
            { $match: { sender: { $in: ["agent", "ai"] }, ...channelIdFilter } },
            {
              $lookup: {
                from: "messages",
                let: { convId: "$conversationId", created: "$createdAt" },
                pipeline: [
                  {
                    $match: {
                      $expr: {
                        $and: [
                          { $eq: ["$conversationId", "$$convId"] },
                          { $eq: ["$sender", "customer"] },
                          { $lt: ["$createdAt", "$$created"] },
                        ],
                      },
                    },
                  },
                  { $sort: { createdAt: -1 } },
                  { $limit: 1 },
                ],
                as: "previousCustomerMessage",
              },
            },
            { $unwind: "$previousCustomerMessage" },
            {
              $project: {
                responseTime: {
                  $divide: [
                    {
                      $subtract: ["$createdAt", "$previousCustomerMessage.createdAt"],
                    },
                    60000, // Convert to minutes
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                avgResponseTime: { $avg: "$responseTime" },
              },
            },
          ]),
        ]);

        const avgResponseTime = avgResponseTimeResult[0]?.avgResponseTime || 0;

        return {
          channelId: channel._id.toString(),
          channelName: channel.name,
          totalConversations,
          aiHandled,
          avgResponseTime: Math.round(avgResponseTime * 10) / 10,
        };
      }),
    );

    return stats;
  }

  /**
   * Get AI performance metrics
   */
  async getAIPerformance(options?: {
    startDate?: Date;
    endDate?: Date;
    channelId?: string;
  }): Promise<{
    totalResponses: number;
    avgConfidence: number;
    resolutionRate: number;
    escalationRate: number;
  }> {
    const { startDate, endDate, channelId } = options || {};

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) {
        (dateFilter.createdAt as Record<string, Date>).$gte = startDate;
      }
      if (endDate) {
        (dateFilter.createdAt as Record<string, Date>).$lte = endDate;
      }
    }

    const channelFilter = channelId ? { channelId } : {};
    const baseFilter = { ...dateFilter, ...channelFilter };

    // Get conversations that had AI involvement (have AI messages)
    const conversationsWithAI = await Message.distinct("conversationId", {
      sender: "ai",
      ...baseFilter,
    });

    const [
      totalAIMessages,
      totalResolvedConversations,
      aiResolved,
      // Escalated = conversations with AI messages but resolved by human
      aiEscalated,
    ] = await Promise.all([
      Message.countDocuments({ sender: "ai", ...baseFilter }),
      Conversation.countDocuments({ status: "resolved", ...baseFilter }),
      Conversation.countDocuments({ status: "resolved", resolvedBy: "ai", ...baseFilter }),
      // Count conversations that had AI involvement but were resolved by human
      Conversation.countDocuments({
        _id: { $in: conversationsWithAI },
        status: "resolved",
        resolvedBy: "human",
        ...baseFilter,
      }),
    ]);

    // Get average confidence from conversations with AI signals
    const confidenceResult = await Conversation.aggregate([
      { $match: { "aiSignals.confidence": { $exists: true, $ne: null }, ...baseFilter } },
      {
        $group: { _id: null, avgConfidence: { $avg: "$aiSignals.confidence" } },
      },
    ]);

    const avgConfidence = confidenceResult[0]?.avgConfidence || 0;
    
    // Resolution rate = AI resolved / total resolved
    const resolutionRate =
      totalResolvedConversations > 0 ? (aiResolved / totalResolvedConversations) * 100 : 0;
    
    // Escalation rate = conversations with AI that were resolved by human / total conversations with AI involvement
    const totalAIInvolved = conversationsWithAI.length;
    const escalationRate =
      totalAIInvolved > 0 ? (aiEscalated / totalAIInvolved) * 100 : 0;

    return {
      totalResponses: totalAIMessages,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      resolutionRate: Math.round(resolutionRate * 10) / 10,
      escalationRate: Math.round(escalationRate * 10) / 10,
    };
  }
}

export const dashboardService = new DashboardService();
