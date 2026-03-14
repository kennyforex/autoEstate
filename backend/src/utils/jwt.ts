import jwt, { Secret, SignOptions } from "jsonwebtoken";
import type { IUserPayload } from "../types/index.js";

const JWT_SECRET: Secret =
  process.env.JWT_SECRET || "default-secret-change-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

export function generateToken(payload: IUserPayload): string {
  return jwt.sign(payload as object, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  } as SignOptions);
}

export function verifyToken(token: string): IUserPayload {
  return jwt.verify(token, JWT_SECRET) as IUserPayload;
}

export function decodeToken(token: string): IUserPayload | null {
  try {
    return jwt.decode(token) as IUserPayload;
  } catch {
    return null;
  }
}
