import { ConversationState, type IGoal, type ISkillStep } from '../models/ConversationState.js';
import type { GoalStack, SkillGoal } from '../agent/types.js';

export interface SkillStepDef {
  id: string;
  label: string;
  collects?: string;
}

class ConversationStateService {
  async load(conversationId: string): Promise<GoalStack | null> {
    let doc;
    try {
      doc = await ConversationState.findOne({ conversationId }).lean();
    } catch {
      return null;
    }
    if (!doc) return null;

    const goals: SkillGoal[] = doc.goals.map((g) => ({
      id: g.id,
      skillSlug: g.skillSlug,
      status: g.status,
      observations: g.observations || {},
      steps: g.steps.map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        collects: s.collects,
        collectedValue: s.collectedValue,
      })),
      createdAt: g.createdAt.getTime(),
      suspendedAt: g.suspendedAt?.getTime(),
      completedAt: g.completedAt?.getTime(),
    }));

    return { goals, activeGoalId: doc.activeGoalId };
  }

  async save(conversationId: string, goalStack: GoalStack): Promise<void> {
    const goals: IGoal[] = goalStack.goals.map((g) => ({
      id: g.id,
      skillSlug: g.skillSlug,
      status: g.status,
      steps: (g.steps || []).map((s) => ({
        id: s.id,
        label: s.label,
        status: s.status,
        collects: s.collects,
        collectedValue: s.collectedValue,
      })),
      observations: g.observations,
      createdAt: new Date(g.createdAt),
      suspendedAt: g.suspendedAt ? new Date(g.suspendedAt) : undefined,
      completedAt: g.completedAt ? new Date(g.completedAt) : undefined,
    }));

    await ConversationState.findOneAndUpdate(
      { conversationId },
      { $set: { goals, activeGoalId: goalStack.activeGoalId } },
      { upsert: true },
    );
  }

  async activateGoal(
    conversationId: string,
    skillSlug: string,
    steps?: SkillStepDef[],
  ): Promise<GoalStack> {
    let goalStack = await this.load(conversationId);
    if (!goalStack) {
      goalStack = { goals: [], activeGoalId: null };
    }

    // Suspend any currently active goals
    for (const g of goalStack.goals) {
      if (g.status === 'active') {
        g.status = 'suspended';
        g.suspendedAt = Date.now();
      }
    }

    // Check if this skill already has a non-completed goal (reactivate it)
    const existing = goalStack.goals.find(
      (g) => g.skillSlug === skillSlug && g.status !== 'completed',
    );

    if (existing) {
      existing.status = 'active';
      goalStack.activeGoalId = existing.id;
    } else {
      const goalId = `goal-${Date.now()}`;
      const skillSteps: SkillGoal['steps'] = (steps || []).map((s) => ({
        id: s.id,
        label: s.label,
        status: 'pending' as const,
        collects: s.collects,
      }));
      // Mark the first step as active
      if (skillSteps.length > 0) {
        skillSteps[0].status = 'active';
      }

      const newGoal: SkillGoal = {
        id: goalId,
        skillSlug,
        status: 'active',
        observations: {},
        steps: skillSteps,
        createdAt: Date.now(),
      };
      goalStack.goals.push(newGoal);
      goalStack.activeGoalId = goalId;
    }

    await this.save(conversationId, goalStack);
    return goalStack;
  }

  async completeGoal(
    conversationId: string,
    skillSlug: string,
    observations: Record<string, string>,
  ): Promise<GoalStack> {
    let goalStack = await this.load(conversationId);
    if (!goalStack) {
      goalStack = { goals: [], activeGoalId: null };
    }

    const goal = goalStack.goals.find(
      (g) => g.skillSlug === skillSlug && g.status !== 'completed',
    );
    if (goal) {
      goal.status = 'completed';
      goal.observations = { ...goal.observations, ...observations };
      goal.completedAt = Date.now();
      // Mark all steps as completed
      for (const step of goal.steps || []) {
        step.status = 'completed';
      }
    }

    // If the completed goal was active, find next suspended to promote
    if (goal && goalStack.activeGoalId === goal.id) {
      const nextSuspended = goalStack.goals.find((g) => g.status === 'suspended');
      goalStack.activeGoalId = nextSuspended?.id || null;
    }

    await this.save(conversationId, goalStack);
    return goalStack;
  }

  async updateStepProgress(
    conversationId: string,
    skillSlug: string,
    observations: Record<string, string>,
  ): Promise<void> {
    const goalStack = await this.load(conversationId);
    if (!goalStack) return;

    const goal = goalStack.goals.find(
      (g) => g.skillSlug === skillSlug && g.status === 'active',
    );
    if (!goal || !goal.steps || goal.steps.length === 0) return;

    goal.observations = { ...goal.observations, ...observations };

    // Match collected observations against step `collects` fields
    for (const step of goal.steps) {
      if (step.collects && observations[step.collects] !== undefined) {
        step.status = 'completed';
        step.collectedValue = observations[step.collects];
      }
    }

    // Advance: find first pending step and mark as active
    const hasActive = goal.steps.some((s) => s.status === 'active');
    if (!hasActive) {
      const nextPending = goal.steps.find((s) => s.status === 'pending');
      if (nextPending) {
        nextPending.status = 'active';
      }
    }

    await this.save(conversationId, goalStack);
  }
}

export const conversationStateService = new ConversationStateService();
