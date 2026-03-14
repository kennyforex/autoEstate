import { Response, NextFunction } from "express";
import { companyService } from "../services/company.service.js";
import { sendTestEmail } from "../services/email.service.js";
import type { AuthRequest } from "../types/index.js";

/**
 * GET /company/public - Public branding (logo, name) for login page. No auth required.
 * Returns logo as a path (e.g. /uploads/logos/xxx.png) when it's our uploads URL
 * so the frontend can resolve it against its API origin and avoid wrong-host failures.
 */
export async function getCompanyPublic(
  req: import("express").Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const company = await companyService.getCompany();
    let logo = company.logo;
    if (logo && typeof logo === "string") {
      const isUploadsUrl =
        logo.startsWith("/uploads/") ||
        (logo.startsWith("http") && logo.includes("/uploads/"));
      if (isUploadsUrl) {
        try {
          const u = new URL(logo, "http://localhost");
          logo = u.pathname;
        } catch {
          // keep logo as-is if URL parse fails
        }
      }
    }
    res.json({
      logo: logo || undefined,
      name: company.name,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /company - Any authenticated user can view the full company profile (including logo).
 * Only update is restricted to admin.
 */
export async function getCompany(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const company = await companyService.getCompany();
    res.json({ company });
  } catch (error) {
    next(error);
  }
}

export async function updateCompany(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const {
      name,
      logo,
      email,
      phone,
      address,
      website,
      timezone,
      smtpHost,
      smtpPort,
      smtpUser,
      smtpPass,
      emailFrom,
      appUrl,
    } = req.body;

    const updates: Partial<{
      name: string;
      logo: string;
      email: string;
      phone: string;
      address: string;
      website: string;
      timezone: string;
      smtpHost: string;
      smtpPort: number;
      smtpUser: string;
      smtpPass: string;
      emailFrom: string;
      appUrl: string;
    }> = {};
    if (name !== undefined) updates.name = name;
    if (logo !== undefined) updates.logo = logo;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (address !== undefined) updates.address = address;
    if (website !== undefined) updates.website = website;
    if (timezone !== undefined) updates.timezone = timezone;
    if (smtpHost !== undefined) updates.smtpHost = smtpHost;
    if (smtpPort !== undefined) updates.smtpPort = smtpPort;
    if (smtpUser !== undefined) updates.smtpUser = smtpUser;
    if (smtpPass !== undefined && smtpPass !== "") updates.smtpPass = smtpPass;
    if (emailFrom !== undefined) updates.emailFrom = emailFrom;
    if (appUrl !== undefined) updates.appUrl = appUrl;

    const company = await companyService.updateCompany(updates);

    if (!company) {
      res.status(404).json({ error: "Company not found" });
      return;
    }

    res.json({ company });
  } catch (error) {
    next(error);
  }
}

export async function sendTestEmailHandler(
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const { to } = req.body;

    const sent = await sendTestEmail(to);
    if (!sent) {
      res.status(400).json({
        error:
          "SMTP not configured or incomplete. Fill in Host, Port, Username, and Password in Settings → Integrations → SMTP and save.",
      });
      return;
    }

    res.json({ success: true, message: "Test email sent successfully" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send test email";
    res.status(500).json({ error: message });
  }
}
