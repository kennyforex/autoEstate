import mongoose from "mongoose";
import {
  AILog,
  Assistant,
  Channel,
  Contact,
  Conversation,
  Message,
  Skill,
} from "../models/index.js";
import {
  ConversationState,
  type IGoal,
  type ISkillStep,
} from "../models/ConversationState.js";

export type SkillGoalStatus = "active" | "suspended" | "completed";

export interface SkillTaskListFilters {
  status?: SkillGoalStatus;
  skillSlug?: string;
  conversationId?: string;
  channelId?: string;
  createdFrom?: Date;
  createdTo?: Date;
  completedFrom?: Date;
  completedTo?: Date;
  search?: string;
}

export interface SkillTaskListOptions {
  limit?: number;
  offset?: number;
}

export interface SkillTaskStepDto {
  id: string;
  label: string;
  status: string;
  collects?: string;
  collectedValue?: string;
}

export interface SkillTaskListItemDto {
  conversationId: string;
  goalId: string;
  skillSlug: string;
  skillDisplayName?: string;
  status: SkillGoalStatus;
  createdAt: string;
  suspendedAt?: string;
  completedAt?: string;
  steps: SkillTaskStepDto[];
  stepsSummary: { completed: number; total: number };
  observations: Record<string, string>;
  tokensApprox: { input: number; output: number; total: number };
  aiMessageCount: number;
  tokensNote?: string;
  contact: {
    name?: string;
    phoneNumber?: string;
    whatsappId?: string;
  };
  assistant: { id?: string; name?: string };
  channel: { id?: string; name?: string };
}

export interface SkillTaskDetailDto extends SkillTaskListItemDto {
  messages: Array<{
    id: string;
    content: string;
    contentType: string;
    createdAt: string;
    aiGenerated: boolean;
  }>;
}

export const SKILL_TASKS_TOKENS_NOTE =
  "Token totals sum AILog entries in the goal time window (approximate: overlapping goals, TTL may drop older logs).";

function stepSummary(steps: ISkillStep[] | undefined): {
  completed: number;
  total: number;
} {
  const list = steps ?? [];
  const total = list.length;
  const completed = list.filter((s) => s.status === "completed").length;
  return { completed, total };
}

function mapGoalToSteps(goal: IGoal): SkillTaskStepDto[] {
  return (goal.steps ?? []).map((s) => ({
    id: s.id,
    label: s.label,
    status: s.status,
    ...(s.collects ? { collects: s.collects } : {}),
    ...(s.collectedValue ? { collectedValue: s.collectedValue } : {}),
  }));
}

export class SkillTasksService {
  async list(
    filters: SkillTaskListFilters,
    options: SkillTaskListOptions = {},
  ): Promise<{ tasks: SkillTaskListItemDto[]; total: number }> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
    const offset = Math.max(options.offset ?? 0, 0);

    const pipeline: mongoose.PipelineStage[] = [];

    if (filters.conversationId) {
      pipeline.push({
        $match: {
          conversationId: new mongoose.Types.ObjectId(filters.conversationId),
        },
      });
    }

    pipeline.push({ $unwind: { path: "$goals" } });

    const goalMatch: Record<string, unknown> = {};
    if (filters.status) {
      goalMatch["goals.status"] = filters.status;
    }
    if (filters.skillSlug) {
      goalMatch["goals.skillSlug"] = filters.skillSlug.trim().toLowerCase();
    }
    if (filters.createdFrom || filters.createdTo) {
      goalMatch["goals.createdAt"] = {};
      if (filters.createdFrom) {
        (goalMatch["goals.createdAt"] as Record<string, Date>).$gte =
          filters.createdFrom;
      }
      if (filters.createdTo) {
        (goalMatch["goals.createdAt"] as Record<string, Date>).$lte =
          filters.createdTo;
      }
    }
    if (filters.completedFrom || filters.completedTo) {
      goalMatch["goals.completedAt"] = {};
      if (filters.completedFrom) {
        (goalMatch["goals.completedAt"] as Record<string, Date>).$gte =
          filters.completedFrom;
      }
      if (filters.completedTo) {
        (goalMatch["goals.completedAt"] as Record<string, Date>).$lte =
          filters.completedTo;
      }
    }
    if (Object.keys(goalMatch).length > 0) {
      pipeline.push({ $match: goalMatch });
    }

    pipeline.push(
      {
        $lookup: {
          from: Conversation.collection.name,
          localField: "conversationId",
          foreignField: "_id",
          as: "conversation",
        },
      },
      { $unwind: { path: "$conversation" } },
    );

    if (filters.channelId) {
      pipeline.push({
        $match: {
          "conversation.channelId": new mongoose.Types.ObjectId(
            filters.channelId,
          ),
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: Contact.collection.name,
          localField: "conversation.contactId",
          foreignField: "_id",
          as: "contact",
        },
      },
      { $unwind: { path: "$contact", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: Channel.collection.name,
          localField: "conversation.channelId",
          foreignField: "_id",
          as: "channel",
        },
      },
      { $unwind: { path: "$channel", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: Assistant.collection.name,
          localField: "channel.assistantId",
          foreignField: "_id",
          as: "assistant",
        },
      },
      { $unwind: { path: "$assistant", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: Skill.collection.name,
          localField: "goals.skillSlug",
          foreignField: "slug",
          as: "skillDoc",
        },
      },
    );

    if (filters.search?.trim()) {
      const rx = new RegExp(
        filters.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i",
      );
      pipeline.push({
        $match: {
          $or: [
            { "contact.name": rx },
            { "contact.phoneNumber": rx },
            { "contact.whatsappId": rx },
          ],
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: AILog.collection.name,
          let: {
            convId: "$conversationId",
            start: "$goals.createdAt",
            end: { $ifNull: ["$goals.completedAt", "$$NOW"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$convId"] },
                    { $gte: ["$createdAt", "$$start"] },
                    { $lte: ["$createdAt", "$$end"] },
                  ],
                },
              },
            },
            {
              $group: {
                _id: null,
                inputTokens: { $sum: { $ifNull: ["$tokens.input", 0] } },
                outputTokens: { $sum: { $ifNull: ["$tokens.output", 0] } },
                totalTokens: { $sum: { $ifNull: ["$tokens.total", 0] } },
              },
            },
          ],
          as: "tokenAgg",
        },
      },
      {
        $lookup: {
          from: Message.collection.name,
          let: {
            convId: "$conversationId",
            start: "$goals.createdAt",
            end: { $ifNull: ["$goals.completedAt", "$$NOW"] },
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$conversationId", "$$convId"] },
                    { $eq: ["$sender", "ai"] },
                    { $gte: ["$createdAt", "$$start"] },
                    { $lte: ["$createdAt", "$$end"] },
                  ],
                },
              },
            },
            { $count: "n" },
          ],
          as: "aiMsgCount",
        },
      },
      { $sort: { "goals.createdAt": -1 as const } },
    );

    const countPipeline = [...pipeline, { $count: "total" }];

    const dataPipeline: mongoose.PipelineStage[] = [
      ...pipeline,
      { $skip: offset },
      { $limit: limit },
    ];

    const [countResult, rows] = await Promise.all([
      ConversationState.aggregate<{ total: number }>(countPipeline),
      ConversationState.aggregate(dataPipeline),
    ]);

    const total = countResult[0]?.total ?? 0;

    const tasks: SkillTaskListItemDto[] = rows.map((row: Record<string, any>) => {
      const g = row.goals as IGoal;
      const tok = row.tokenAgg?.[0];
      const msgN = row.aiMsgCount?.[0]?.n ?? 0;
      const skillName = row.skillDoc?.[0]?.name as string | undefined;

      return {
        conversationId: String(row.conversationId),
        goalId: g.id,
        skillSlug: g.skillSlug,
        ...(skillName ? { skillDisplayName: skillName } : {}),
        status: g.status as SkillGoalStatus,
        createdAt: new Date(g.createdAt).toISOString(),
        ...(g.suspendedAt
          ? { suspendedAt: new Date(g.suspendedAt).toISOString() }
          : {}),
        ...(g.completedAt
          ? { completedAt: new Date(g.completedAt).toISOString() }
          : {}),
        steps: mapGoalToSteps(g),
        stepsSummary: stepSummary(g.steps),
        observations: (g.observations as Record<string, string>) || {},
        tokensApprox: {
          input: tok?.inputTokens ?? 0,
          output: tok?.outputTokens ?? 0,
          total: tok?.totalTokens ?? 0,
        },
        aiMessageCount: msgN,
        contact: {
          name: row.contact?.name,
          phoneNumber: row.contact?.phoneNumber,
          whatsappId: row.contact?.whatsappId,
        },
        assistant: row.assistant?._id
          ? {
              id: String(row.assistant._id),
              name: row.assistant.name,
            }
          : {},
        channel: row.channel?._id
          ? {
              id: String(row.channel._id),
              name: row.channel.name,
            }
          : {},
      };
    });

    return { tasks, total };
  }

  async getDetail(
    conversationId: string,
    goalId: string,
  ): Promise<SkillTaskDetailDto | null> {
    let convOid: mongoose.Types.ObjectId;
    try {
      convOid = new mongoose.Types.ObjectId(conversationId);
    } catch {
      return null;
    }

    const doc = await ConversationState.findOne({
      conversationId: convOid,
    }).lean();
    if (!doc) return null;

    const goal = doc.goals.find((g) => g.id === goalId);
    if (!goal) return null;

    const conv = await Conversation.findById(convOid)
      .populate("contactId", "name phoneNumber whatsappId")
      .populate({
        path: "channelId",
        select: "name assistantId",
        populate: {
          path: "assistantId",
          select: "name",
        },
      })
      .lean();

    if (!conv) return null;

    const start = new Date(goal.createdAt);
    const end = goal.completedAt ? new Date(goal.completedAt) : new Date();

    const [messages, tokenAgg, skillDoc] = await Promise.all([
      Message.find({
        conversationId: convOid,
        sender: "ai",
        createdAt: { $gte: start, $lte: end },
      })
        .sort({ createdAt: 1 })
        .limit(500)
        .lean(),
      AILog.aggregate<{
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }>([
        {
          $match: {
            conversationId: convOid,
            createdAt: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: null,
            inputTokens: { $sum: { $ifNull: ["$tokens.input", 0] } },
            outputTokens: { $sum: { $ifNull: ["$tokens.output", 0] } },
            totalTokens: { $sum: { $ifNull: ["$tokens.total", 0] } },
          },
        },
      ]),
      Skill.findOne({ slug: goal.skillSlug }).select("name slug").lean(),
    ]);

    const tok = tokenAgg[0];
    const c = conv as Record<string, unknown>;
    const contact = c.contactId as Record<string, unknown> | undefined;
    const channel = c.channelId as Record<string, unknown> | undefined;
    const assistant = channel?.assistantId as
      | Record<string, unknown>
      | undefined;

    const contactDto = {
      name: contact?.name as string | undefined,
      phoneNumber: contact?.phoneNumber as string | undefined,
      whatsappId: contact?.whatsappId as string | undefined,
    };

    const base: SkillTaskListItemDto = {
      conversationId: String(convOid),
      goalId: goal.id,
      skillSlug: goal.skillSlug,
      ...(skillDoc?.name ? { skillDisplayName: skillDoc.name } : {}),
      status: goal.status as SkillGoalStatus,
      createdAt: start.toISOString(),
      ...(goal.suspendedAt
        ? { suspendedAt: new Date(goal.suspendedAt).toISOString() }
        : {}),
      ...(goal.completedAt
        ? { completedAt: new Date(goal.completedAt).toISOString() }
        : {}),
      steps: mapGoalToSteps(goal as IGoal),
      stepsSummary: stepSummary(goal.steps),
      observations: (goal.observations as Record<string, string>) || {},
      tokensApprox: {
        input: tok?.inputTokens ?? 0,
        output: tok?.outputTokens ?? 0,
        total: tok?.totalTokens ?? 0,
      },
      aiMessageCount: messages.length,
      tokensNote: SKILL_TASKS_TOKENS_NOTE,
      contact: contactDto,
      assistant: assistant?._id
        ? {
            id: String(assistant._id),
            name: assistant.name as string,
          }
        : {},
      channel: channel?._id
        ? {
            id: String(channel._id),
            name: channel.name as string,
          }
        : {},
    };

    return {
      ...base,
      messages: messages.map((m) => ({
        id: String(m._id),
        content: m.content,
        contentType: m.contentType,
        createdAt: new Date(m.createdAt).toISOString(),
        aiGenerated: m.aiGenerated,
      })),
    };
  }
}

export const skillTasksService = new SkillTasksService();
