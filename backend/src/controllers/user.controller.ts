import { Response, NextFunction } from "express";
import { userService } from "../services/user.service.js";
import type { AuthRequest } from "../types/index.js";

export async function listUsers(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const users = await userService.listUsers();
    res.json({ users });
  } catch (error) {
    next(error);
  }
}

export async function inviteUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { email, name, role } = req.body;
    const inviterName = req.user?.name;

    const result = await userService.inviteUser({
      email,
      name,
      role,
      inviterName,
    });

    res.status(201).json({
      message: "User invited successfully",
      user: result.user,
      emailSent: result.emailSent,
      ...(result.emailError && { emailError: result.emailError }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function resendInvite(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { id } = req.params;
    const inviterName = req.user?.name;

    const result = await userService.resendInvite(id, inviterName);

    res.json({
      message: "Invitation resent",
      emailSent: result.emailSent,
      ...(result.emailError && { emailError: result.emailError }),
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("not found")) {
        res.status(404).json({ error: error.message });
        return;
      }
      if (error.message.includes("Only pending")) {
        res.status(400).json({ error: error.message });
        return;
      }
    }
    next(error);
  }
}

export async function updateUserRole(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { id } = req.params;
    const { role } = req.body;

    const user = await userService.updateUserRole(id, role);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function updateUserStatus(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { id } = req.params;
    const { status } = req.body;

    const user = await userService.updateUserStatus(id, status);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function removeUser(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { id } = req.params;

    const removed = await userService.removeUser(id, req.user.userId);

    if (!removed) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ message: "User removed successfully" });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot remove yourself")
    ) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}
