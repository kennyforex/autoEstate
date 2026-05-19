import { Company, type ICompanyDocument } from "../models/index.js";
import type { IModerationSettings } from "../types/moderation.js";
import {
  mergeModerationSettings,
  normalizeModerationSettings,
} from "./moderation.service.js";

class CompanyService {
  /**
   * Get the company profile (creates a default one if none exists).
   * Any authenticated user (admin or not) receives the full profile including logo.
   */
  async getCompany(): Promise<ICompanyDocument> {
    let company = await Company.findOne();

    if (!company) {
      company = new Company({
        name: "My Company",
        timezone: "UTC",
      });
      await company.save();
    }

    company.moderationSettings = mergeModerationSettings(
      company.moderationSettings,
    );
    return company;
  }

  /**
   * Update the company profile (including SMTP for invite emails)
   */
  async updateCompany(
    updates: Partial<
      Pick<
        ICompanyDocument,
        | "name"
        | "logo"
        | "email"
        | "phone"
        | "address"
        | "website"
        | "timezone"
        | "smtpHost"
        | "smtpPort"
        | "smtpUser"
        | "smtpPass"
        | "emailFrom"
        | "appUrl"
        | "moderationSettings"
      >
    >,
  ): Promise<ICompanyDocument | null> {
    let company = await Company.findOne();
    
    if (!company) {
      // Create a new company with the provided updates
      company = new Company({
        name: updates.name || "My Company",
        ...updates,
      });
      await company.save();
      return company;
    }
    
    if (updates.moderationSettings !== undefined) {
      company.moderationSettings = normalizeModerationSettings(
        updates.moderationSettings as IModerationSettings,
      );
    }

    const { moderationSettings: _moderation, ...rest } = updates;
    Object.assign(company, rest);
    await company.save();

    company.moderationSettings = mergeModerationSettings(company.moderationSettings);
    return company;
  }

  /**
   * Validate moderation payload before persist (throws on invalid notify config).
   */
  validateModerationSettings(input: unknown): IModerationSettings {
    const normalized = normalizeModerationSettings(
      (input ?? {}) as Partial<IModerationSettings>,
    );
    if (normalized.notifyEnabled && !normalized.notifyPhoneNumber) {
      throw new Error(
        "Manager notify phone is required when alerts are enabled",
      );
    }
    return normalized;
  }
}

export const companyService = new CompanyService();
