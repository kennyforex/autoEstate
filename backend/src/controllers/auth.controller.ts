import { Request, Response, NextFunction } from "express";
import { authService } from "../services/auth.service.js";
import type { AuthRequest } from "../types/index.js";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password, name, role } = req.body;

    const result = await authService.register({ email, password, name, role });

    res.status(201).json({
      message: "User registered successfully",
      user: result.user,
      token: result.token,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already exists")) {
      res.status(409).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { email, password } = req.body;

    const result = await authService.login({ email, password });

    res.json({
      message: "Login successful",
      user: result.user,
      token: result.token,
      ...(result.requiresPasswordSet && { requiresPasswordSet: true }),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes("Invalid") || error.message.includes("inactive"))
    ) {
      res.status(401).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function getMe(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const user = await authService.getUserById(req.user.userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function updateProfile(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { name, avatar, timezone, language } = req.body;

    const user = await authService.updateUser(req.user.userId, {
      name,
      avatar,
      timezone,
      language,
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { currentPassword, newPassword } = req.body;

    await authService.changePassword(
      req.user.userId,
      currentPassword,
      newPassword,
    );

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    if (error instanceof Error && error.message.includes("incorrect")) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}

export async function setPassword(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { newPassword } = req.body;

    const user = await authService.setPasswordForPending(
      req.user.userId,
      newPassword,
    );

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    res.json({
      message: "Password set successfully. You can now use the app.",
      user,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Only pending")) {
      res.status(400).json({ error: error.message });
      return;
    }
    next(error);
  }
}
