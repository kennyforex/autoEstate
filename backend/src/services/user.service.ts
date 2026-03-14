import { User, type IUserDocument } from "../models/index.js";
import crypto from "crypto";
import { sendInviteEmail } from "./email.service.js";

class UserService {
  /**
   * List all users (team members)
   */
  async listUsers(): Promise<IUserDocument[]> {
    return User.find().sort({ createdAt: -1 });
  }

  /**
   * Get user by ID
   */
  async getUserById(userId: string): Promise<IUserDocument | null> {
    return User.findById(userId);
  }

  /**
   * Invite a new team member
   * Creates a user with a random temporary password and sends an invite email (if SMTP configured)
   */
  async inviteUser(input: {
    email: string;
    name?: string;
    role: "admin" | "agent" | "viewer";
    inviterName?: string;
  }): Promise<{
    user: IUserDocument;
    emailSent: boolean;
    emailError?: string;
  }> {
    const { email, name, role, inviterName } = input;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error("User with this email already exists");
    }

    // Generate a random temporary password
    const tempPassword = crypto.randomBytes(16).toString("hex");

    // Create the user (pending until they set password on first login)
    const user = new User({
      email,
      name: name || email.split("@")[0],
      passwordHash: tempPassword, // Will be hashed by pre-save hook
      role,
      status: "pending",
    });

    await user.save();

    let emailSent = false;
    let emailError: string | undefined;
    try {
      emailSent = await sendInviteEmail({
        to: email,
        name: user.name,
        tempPassword,
        inviterName,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send email";
      console.error("[UserService] Failed to send invite email:", err);
      emailError = message;
    }

    return { user, emailSent, emailError };
  }

  /**
   * Resend invite email to a pending user. Generates a new temporary password and sends the email.
   */
  async resendInvite(
    userId: string,
    inviterName?: string,
  ): Promise<{ emailSent: boolean; emailError?: string }> {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }
    if (user.status !== "pending") {
      throw new Error("Only pending users can have their invitation resent");
    }

    const tempPassword = crypto.randomBytes(16).toString("hex");
    user.passwordHash = tempPassword; // Will be hashed by pre-save hook
    await user.save();

    let emailSent = false;
    let emailError: string | undefined;
    try {
      emailSent = await sendInviteEmail({
        to: user.email,
        name: user.name,
        tempPassword,
        inviterName,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send email";
      console.error("[UserService] Failed to resend invite email:", err);
      emailError = message;
    }

    return { emailSent, emailError };
  }

  /**
   * Update a user's role
   */
  async updateUserRole(
    userId: string,
    role: "admin" | "agent" | "viewer",
  ): Promise<IUserDocument | null> {
    return User.findByIdAndUpdate(userId, { role }, { new: true });
  }

  /**
   * Update a user's status (active | inactive)
   */
  async updateUserStatus(
    userId: string,
    status: "active" | "inactive",
  ): Promise<IUserDocument | null> {
    return User.findByIdAndUpdate(userId, { status }, { new: true });
  }

  /**
   * Remove a user from the team
   */
  async removeUser(userId: string, requestingUserId: string): Promise<boolean> {
    // Prevent self-delete
    if (userId === requestingUserId) {
      throw new Error("Cannot remove yourself");
    }

    const result = await User.findByIdAndDelete(userId);
    return !!result;
  }
}

export const userService = new UserService();
