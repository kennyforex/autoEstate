import { Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt.js";
import type { AuthRequest } from "../types/index.js";

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({ error: "No authorization header provided" });
      return;
    }

    const [bearer, token] = authHeader.split(" ");

    if (bearer !== "Bearer" || !token) {
      res
        .status(401)
        .json({ error: "Invalid authorization format. Use: Bearer <token>" });
      return;
    }

    const decoded = verifyToken(token);
    req.user = decoded;

    next();
  } catch (error) {
    if (error instanceof Error && error.name === "TokenExpiredError") {
      res.status(401).json({ error: "Token expired" });
      return;
    }

    res.status(401).json({ error: "Invalid token" });
  }
}

export function optionalAuthMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): void {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const [bearer, token] = authHeader.split(" ");

      if (bearer === "Bearer" && token) {
        const decoded = verifyToken(token);
        req.user = decoded;
      }
    }

    next();
  } catch {
    // Token is invalid but we continue without user context
    next();
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }

    next();
  };
}
