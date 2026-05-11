/**
 * AI Logger Service
 * Stores AI usage logs in MongoDB with in-memory cache for performance
 */

import { AILog, type AIModelSource, type IAILogDocument } from "../models/index.js";
import mongoose from "mongoose";

export interface AILogEntry {
  id: string;
  timestamp: Date;
  type:
    | "classification"
    | "simple_reply"
    | "complex_reply"
    | "media_analysis"
    | "decision"
    | "tool_calling"
    | "error"
    | "info";
  conversationId?: string;
  messageId?: string;
  channelId?: string;
  assistantId?: string;
  model?: string;
  modelSource?: AIModelSource;
  input?: string;
  output?: string;
  duration?: number;
  tokens?: {
    input?: number;
    output?: number;
    total?: number;
  };
  metadata?: Record<string, any>;
  level: "info" | "warn" | "error";
}

class AILoggerService {
  private logs: AILogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 logs in memory cache
  private logCounter = 0;

  private generateId(): string {
    this.logCounter++;
    return `log_${Date.now()}_${this.logCounter}`;
  }

  /**
   * Convert string ID to ObjectId if valid, otherwise return undefined
   */
  private toObjectId(id?: string): mongoose.Types.ObjectId | undefined {
    if (!id) return undefined;
    try {
      return new mongoose.Types.ObjectId(id);
    } catch {
      return undefined;
    }
  }

  private stringifyForLog(value: unknown): string {
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  /**
   * Add a log entry (persists to both memory and database)
   */
  log(entry: Omit<AILogEntry, "id" | "timestamp">): AILogEntry {
    const logEntry: AILogEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...entry,
    };

    // Add to memory cache
    this.logs.push(logEntry);

    // Trim old logs if we exceed max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to console for debugging
    const prefix = `[AI:${entry.type.toUpperCase()}]`;
    if (entry.level === "error") {
      console.error(
        prefix,
        entry.metadata?.error || entry.output || entry.input,
      );
    } else if (entry.level === "warn") {
      console.warn(prefix, entry.output || entry.input || entry.metadata);
    } else {
      console.log(prefix, entry.output || entry.input || entry.metadata);
    }

    // Persist to database asynchronously (don't block)
    this.persistToDatabase(logEntry).catch((err) => {
      console.error("[AILogger] Failed to persist log to database:", err);
    });

    return logEntry;
  }

  /**
   * Persist log entry to MongoDB
   */
  private async persistToDatabase(logEntry: AILogEntry): Promise<void> {
    try {
      await AILog.create({
        type: logEntry.type,
        level: logEntry.level,
        conversationId: this.toObjectId(logEntry.conversationId),
        messageId: this.toObjectId(logEntry.messageId),
        channelId: this.toObjectId(logEntry.channelId),
        assistantId: this.toObjectId(logEntry.assistantId),
        model: logEntry.model,
        modelSource: logEntry.modelSource,
        input: logEntry.input,
        output: logEntry.output,
        duration: logEntry.duration,
        tokens: logEntry.tokens,
        metadata: logEntry.metadata,
      });
    } catch (err) {
      // Log error but don't throw - we don't want to break AI processing
      console.error("[AILogger] Database persist error:", err);
    }
  }

  /**
   * Log classification event
   */
  logClassification(params: {
    conversationId?: string;
    messageId?: string;
    input: string;
    result: "SIMPLE" | "COMPLEX";
    duration: number;
    model?: string;
    modelSource?: AIModelSource;
  }): AILogEntry {
    return this.log({
      type: "classification",
      level: "info",
      conversationId: params.conversationId,
      messageId: params.messageId,
      model: params.model,
      modelSource: params.modelSource,
      input: params.input,
      output: params.result,
      duration: params.duration,
      metadata: {
        inputLength: params.input.length,
      },
    });
  }

  /**
   * Log simple reply generation
   */
  logSimpleReply(params: {
    conversationId?: string;
    input: string;
    output: string;
    duration: number;
    model?: string;
    modelSource?: AIModelSource;
    tokens?: { input?: number; output?: number; total?: number };
  }): AILogEntry {
    return this.log({
      type: "simple_reply",
      level: "info",
      conversationId: params.conversationId,
      model: params.model,
      modelSource: params.modelSource,
      input: params.input,
      output: params.output,
      duration: params.duration,
      tokens: params.tokens,
      metadata: {
        inputLength: params.input.length,
        outputLength: params.output.length,
      },
    });
  }

  /**
   * Log complex reply generation via Pinecone
   */
  logComplexReply(params: {
    conversationId?: string;
    assistantId?: string;
    input: string;
    output: string;
    duration: number;
    citations?: any[];
    model?: string;
    modelSource?: AIModelSource;
    tokens?: { input?: number; output?: number; total?: number };
    metadata?: Record<string, any>;
  }): AILogEntry {
    return this.log({
      type: "complex_reply",
      level: "info",
      conversationId: params.conversationId,
      assistantId: params.assistantId,
      model: params.model,
      modelSource: params.modelSource,
      input: params.input,
      output: params.output,
      duration: params.duration,
      tokens: params.tokens,
      metadata: {
        inputLength: params.input.length,
        outputLength: params.output.length,
        citationCount: params.citations?.length || 0,
        citations: params.citations,
        ...params.metadata,
      },
    });
  }

  /**
   * Log media analysis
   */
  logMediaAnalysis(params: {
    conversationId?: string;
    messageId?: string;
    mediaType: "image" | "audio";
    mediaUrl?: string;
    result: string;
    duration: number;
    model?: string;
    modelSource?: AIModelSource;
  }): AILogEntry {
    return this.log({
      type: "media_analysis",
      level: "info",
      conversationId: params.conversationId,
      messageId: params.messageId,
      model: params.model,
      modelSource: params.modelSource,
      input: `[${params.mediaType}] ${params.mediaUrl?.substring(0, 50) || "N/A"}...`,
      output: params.result,
      duration: params.duration,
      metadata: {
        mediaType: params.mediaType,
      },
    });
  }

  /**
   * Log AI decision (e.g., should auto-reply)
   */
  logDecision(params: {
    conversationId?: string;
    channelId?: string;
    decision: string;
    reason: string;
    metadata?: Record<string, any>;
  }): AILogEntry {
    return this.log({
      type: "decision",
      level: "info",
      conversationId: params.conversationId,
      channelId: params.channelId,
      output: `${params.decision}: ${params.reason}`,
      metadata: params.metadata,
    });
  }

  /**
   * Log agent tool execution with full arguments/result summary where practical.
   */
  logToolCall(params: {
    conversationId?: string;
    channelId?: string;
    assistantId?: string;
    toolName: string;
    args?: Record<string, unknown>;
    summary?: string;
    resultData?: unknown;
    error?: string;
    success: boolean;
    duration?: number;
    iteration?: number;
    maxIterations?: number;
    toolCallId?: string;
    source?: "playground" | "inbox" | "skill" | string;
    metadata?: Record<string, any>;
  }): AILogEntry {
    const output = params.error || params.summary || "";

    return this.log({
      type: "tool_calling",
      level: params.error ? "error" : params.success ? "info" : "warn",
      conversationId: params.conversationId,
      channelId: params.channelId,
      assistantId: params.assistantId,
      input: this.stringifyForLog(params.args || {}),
      output,
      duration: params.duration,
      metadata: {
        toolName: params.toolName,
        success: params.success,
        source: params.source,
        iteration: params.iteration,
        maxIterations: params.maxIterations,
        toolCallId: params.toolCallId,
        inputLength: this.stringifyForLog(params.args || {}).length,
        outputLength: output.length,
        ...(params.resultData !== undefined ? { toolResultData: params.resultData } : {}),
        ...params.metadata,
      },
    });
  }

  /**
   * Log error
   */
  logError(params: {
    conversationId?: string;
    assistantId?: string;
    error: Error | string;
    context?: string;
    metadata?: Record<string, any>;
  }): AILogEntry {
    const errorMessage =
      params.error instanceof Error ? params.error.message : params.error;
    const errorStack =
      params.error instanceof Error ? params.error.stack : undefined;

    return this.log({
      type: "error",
      level: "error",
      conversationId: params.conversationId,
      assistantId: params.assistantId,
      output: errorMessage,
      metadata: {
        context: params.context,
        stack: errorStack,
        ...params.metadata,
      },
    });
  }

  /**
   * Log general info
   */
  logInfo(params: {
    conversationId?: string;
    message: string;
    metadata?: Record<string, any>;
  }): AILogEntry {
    return this.log({
      type: "info",
      level: "info",
      conversationId: params.conversationId,
      output: params.message,
      metadata: params.metadata,
    });
  }

  /**
   * Log successful skill goal completion for goal-list confirmation.
   */
  logSkillGoalCompleted(params: {
    conversationId?: string;
    assistantId?: string;
    skillSlug: string;
    observations?: Record<string, unknown>;
    source?: "playground" | "inbox" | string;
    goalStatePersisted?: boolean;
    metadata?: Record<string, any>;
  }): AILogEntry {
    return this.log({
      type: "info",
      level: "info",
      conversationId: params.conversationId,
      assistantId: params.assistantId,
      output: `Skill goal completed: ${params.skillSlug}`,
      metadata: {
        event: "skill_goal_completed",
        skillSlug: params.skillSlug,
        observations: params.observations || {},
        source: params.source,
        goalStatePersisted: params.goalStatePersisted,
        ...params.metadata,
      },
    });
  }

  /**
   * Convert database document to AILogEntry format
   */
  private dbToLogEntry(doc: IAILogDocument): AILogEntry {
    return {
      id: doc._id.toString(),
      timestamp: doc.createdAt,
      type: doc.type,
      level: doc.level,
      conversationId: doc.conversationId?.toString(),
      messageId: doc.messageId?.toString(),
      channelId: doc.channelId?.toString(),
      assistantId: doc.assistantId?.toString(),
      model: doc.model,
      modelSource: doc.modelSource,
      input: doc.input,
      output: doc.output,
      duration: doc.duration,
      tokens: doc.tokens,
      metadata: doc.metadata as Record<string, any>,
    };
  }

  /**
   * Get all logs (with optional filtering)
   * Queries database for persistent logs
   */
  async getLogs(options?: {
    type?: AILogEntry["type"];
    level?: AILogEntry["level"];
    conversationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ logs: AILogEntry[]; total: number }> {
    try {
      const query: Record<string, any> = {};

      if (options?.type) {
        query.type = options.type;
      }

      if (options?.level) {
        query.level = options.level;
      }

      if (options?.conversationId) {
        query.conversationId = this.toObjectId(options.conversationId);
      }

      const limit = options?.limit || 100;
      const offset = options?.offset || 0;

      const [logs, total] = await Promise.all([
        AILog.find(query)
          .sort({ createdAt: -1 })
          .skip(offset)
          .limit(limit)
          .lean(),
        AILog.countDocuments(query),
      ]);

      return {
        logs: logs.map((doc) => this.dbToLogEntry(doc as unknown as IAILogDocument)),
        total,
      };
    } catch (err) {
      console.error("[AILogger] Failed to get logs from database:", err);
      // Fallback to memory cache if database fails
      return this.getLogsFromMemory(options);
    }
  }

  /**
   * Fallback method to get logs from memory cache
   */
  private getLogsFromMemory(options?: {
    type?: AILogEntry["type"];
    level?: AILogEntry["level"];
    conversationId?: string;
    limit?: number;
    offset?: number;
  }): { logs: AILogEntry[]; total: number } {
    let filteredLogs = [...this.logs];

    if (options?.type) {
      filteredLogs = filteredLogs.filter((log) => log.type === options.type);
    }

    if (options?.level) {
      filteredLogs = filteredLogs.filter((log) => log.level === options.level);
    }

    if (options?.conversationId) {
      filteredLogs = filteredLogs.filter(
        (log) => log.conversationId === options.conversationId,
      );
    }

    // Sort by timestamp descending (newest first)
    filteredLogs.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const total = filteredLogs.length;
    const offset = options?.offset || 0;
    const limit = options?.limit || 100;

    return {
      logs: filteredLogs.slice(offset, offset + limit),
      total,
    };
  }

  /**
   * Get statistics from database
   */
  async getStats(): Promise<{
    total: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
    avgDuration: number;
    errorRate: number;
  }> {
    try {
      const [total, typeAgg, levelAgg, durationAgg, errorCount] =
        await Promise.all([
          AILog.countDocuments(),
          AILog.aggregate([
            { $group: { _id: "$type", count: { $sum: 1 } } },
          ]),
          AILog.aggregate([
            { $group: { _id: "$level", count: { $sum: 1 } } },
          ]),
          AILog.aggregate([
            { $match: { duration: { $exists: true, $ne: null } } },
            { $group: { _id: null, avgDuration: { $avg: "$duration" } } },
          ]),
          AILog.countDocuments({ level: "error" }),
        ]);

      const byType: Record<string, number> = {};
      for (const item of typeAgg) {
        byType[item._id] = item.count;
      }

      const byLevel: Record<string, number> = {};
      for (const item of levelAgg) {
        byLevel[item._id] = item.count;
      }

      const avgDuration =
        durationAgg.length > 0 ? Math.round(durationAgg[0].avgDuration) : 0;

      return {
        total,
        byType,
        byLevel,
        avgDuration,
        errorRate: total > 0 ? Math.round((errorCount / total) * 100) : 0,
      };
    } catch (err) {
      console.error("[AILogger] Failed to get stats from database:", err);
      // Fallback to memory cache
      return this.getStatsFromMemory();
    }
  }

  /**
   * Fallback method to get stats from memory cache
   */
  private getStatsFromMemory(): {
    total: number;
    byType: Record<string, number>;
    byLevel: Record<string, number>;
    avgDuration: number;
    errorRate: number;
  } {
    const byType: Record<string, number> = {};
    const byLevel: Record<string, number> = {};
    let totalDuration = 0;
    let durationCount = 0;
    let errorCount = 0;

    for (const log of this.logs) {
      byType[log.type] = (byType[log.type] || 0) + 1;
      byLevel[log.level] = (byLevel[log.level] || 0) + 1;

      if (log.duration) {
        totalDuration += log.duration;
        durationCount++;
      }

      if (log.level === "error") {
        errorCount++;
      }
    }

    return {
      total: this.logs.length,
      byType,
      byLevel,
      avgDuration:
        durationCount > 0 ? Math.round(totalDuration / durationCount) : 0,
      errorRate:
        this.logs.length > 0
          ? Math.round((errorCount / this.logs.length) * 100)
          : 0,
    };
  }

  /**
   * Clear all logs (memory and database)
   */
  async clearLogs(): Promise<void> {
    // Clear memory cache
    this.logs = [];
    this.logCounter = 0;

    // Clear database
    try {
      await AILog.deleteMany({});
    } catch (err) {
      console.error("[AILogger] Failed to clear logs from database:", err);
    }
  }

  /**
   * Get logs for a specific conversation
   */
  async getLogsByConversation(
    conversationId: string,
    limit = 100,
  ): Promise<AILogEntry[]> {
    try {
      const logs = await AILog.find({
        conversationId: this.toObjectId(conversationId),
      })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

      return logs.map((doc) => this.dbToLogEntry(doc as unknown as IAILogDocument));
    } catch (err) {
      console.error(
        "[AILogger] Failed to get conversation logs from database:",
        err,
      );
      // Fallback to memory cache
      return this.logs
        .filter((log) => log.conversationId === conversationId)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        )
        .slice(0, limit);
    }
  }
}

export const aiLogger = new AILoggerService();
