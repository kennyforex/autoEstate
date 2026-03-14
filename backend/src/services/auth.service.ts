import { User, type IUserDocument } from "../models/index.js";
import { generateToken } from "../utils/jwt.js";
import type { IUserPayload } from "../types/index.js";

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
  role?: "admin" | "agent" | "viewer";
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  user: IUserDocument;
  token: string;
  /** Set when user is pending (invited); they must set password before using the app */
  requiresPasswordSet?: boolean;
}

class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const { email, password, name, role = "agent" } = input;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Create new user
    const user = new User({
      email,
      passwordHash: password, // Will be hashed by pre-save hook
      name,
      role,
    });

    await user.save();

    // Generate token
    const payload: IUserPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = generateToken(payload);

    return { user, token };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const { email, password } = input;

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const status = user.status ?? "active";
    if (status === "inactive") {
      throw new Error("Account is inactive. Contact an administrator.");
    }

    // Check password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      throw new Error("Invalid email or password");
    }

    // Update last login and, for pending users, set status to active so Team Members shows Active
    user.lastLoginAt = new Date();
    if (status === "pending") {
      user.status = "active";
    }
    await user.save();

    // Generate token
    const payload: IUserPayload = {
      userId: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
    const token = generateToken(payload);

    const requiresPasswordSet = status === "pending";

    return { user, token, requiresPasswordSet };
  }

  /**
   * Set password for a pending user (first-time login). Also allows users who were
   * just set to active on login (so they can complete the set-password step).
   */
  async setPasswordForPending(
    userId: string,
    newPassword: string,
  ): Promise<IUserDocument | null> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.status !== "pending" && user.status !== "active") {
      throw new Error("Only pending or newly active users can use this flow");
    }
    user.passwordHash = newPassword; // Will be hashed by pre-save hook
    user.status = "active";
    await user.save();
    return user;
  }

  async getUserById(userId: string): Promise<IUserDocument | null> {
    return User.findById(userId);
  }

  async updateUser(
    userId: string,
    updates: Partial<
      Pick<IUserDocument, "name" | "avatar" | "timezone" | "language">
    >,
  ): Promise<IUserDocument | null> {
    return User.findByIdAndUpdate(userId, updates, { new: true });
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    const isValidPassword = await user.comparePassword(currentPassword);
    if (!isValidPassword) {
      throw new Error("Current password is incorrect");
    }

    user.passwordHash = newPassword; // Will be hashed by pre-save hook
    await user.save();

    return true;
  }
}

export const authService = new AuthService();
