import nodemailer from "nodemailer";
import { Company } from "../models/index.js";

export interface SmtpConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  emailFrom?: string;
  appUrl?: string;
}

/**
 * Load SMTP config from Company settings (Settings > General > Email).
 * Returns null if not configured.
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const company = await Company.findOne().select(
    "smtpHost smtpPort smtpUser smtpPass emailFrom appUrl",
  );
  if (
    !company?.smtpHost ||
    !company?.smtpUser ||
    !(company as { smtpPass?: string }).smtpPass
  ) {
    return null;
  }
  const smtpPass = (company as { smtpPass?: string }).smtpPass;
  return {
    smtpHost: company.smtpHost,
    smtpPort: company.smtpPort ?? 587,
    smtpUser: company.smtpUser,
    smtpPass,
    emailFrom: company.emailFrom,
    appUrl: company.appUrl,
  };
}

function createTransporter(config: SmtpConfig): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpPort === 465,
    auth: {
      user: config.smtpUser,
      pass: config.smtpPass,
    },
  });
}

export interface SendInviteOptions {
  to: string;
  name: string;
  tempPassword: string;
  inviterName?: string;
}

/** Returns true if email was sent, false if SMTP not configured (skipped). Throws on send failure. */
export async function sendInviteEmail(
  options: SendInviteOptions,
): Promise<boolean> {
  const { to, name, tempPassword, inviterName } = options;

  const config = await getSmtpConfig();
  if (!config) {
    console.warn(
      "[Email] Skipping invite email to",
      to,
      "(SMTP not configured in Settings > Integrations > SMTP)",
    );
    return false;
  }

  const transport = createTransporter(config);
  const appUrl =
    config.appUrl ||
    process.env.APP_URL ||
    process.env.FRONTEND_URL ||
    "http://localhost:5173";
  const emailFrom = config.emailFrom || config.smtpUser || "noreply@localhost";
  const loginUrl = appUrl.replace(/\/$/, "") + "/login";
  const subject = inviterName
    ? `You're invited to join the team by ${inviterName}`
    : "You're invited to join the team";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team invitation</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 560px; margin: 0 auto; padding: 24px;">
  <h1 style="font-size: 1.5rem; margin-bottom: 16px;">You're invited to the team</h1>
  <p>Hi ${escapeHtml(name)},</p>
  <p>${inviterName ? `${escapeHtml(inviterName)} has invited you` : "You have been invited"} to join the team. Use the details below to sign in:</p>
  <p><strong>Email:</strong> ${escapeHtml(to)}</p>
  <p><strong>Temporary password:</strong> <code style="background: #f0f0f0; padding: 2px 6px; border-radius: 4px;">${escapeHtml(tempPassword)}</code></p>
  <p><a href="${escapeHtml(loginUrl)}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 10px 20px; border-radius: 6px; margin-top: 8px;">Sign in</a></p>
  <p style="margin-top: 24px; font-size: 0.875rem; color: #666;">Please change your password after your first login. If you didn't expect this invite, you can ignore this email.</p>
</body>
</html>
`.trim();

  const text = `
You're invited to the team

Hi ${name},

${inviterName ? `${inviterName} has invited you` : "You have been invited"} to join the team. Use the details below to sign in:

Email: ${to}
Temporary password: ${tempPassword}

Sign in: ${loginUrl}

Please change your password after your first login. If you didn't expect this invite, you can ignore this email.
`.trim();

  await transport.sendMail({
    from: emailFrom,
    to,
    subject,
    text,
    html,
  });
  return true;
}

/** Send a simple test email. Returns true if sent, false if SMTP not configured. Throws on failure. */
export async function sendTestEmail(to: string): Promise<boolean> {
  const config = await getSmtpConfig();
  if (!config) {
    return false;
  }
  const transport = createTransporter(config);
  const emailFrom = config.emailFrom || config.smtpUser || "noreply@localhost";
  await transport.sendMail({
    from: emailFrom,
    to,
    subject: "AutoEstate – SMTP test",
    text: "This is a test email from your AutoEstate SMTP settings. If you received this, your configuration is working.",
    html: "<p>This is a test email from your AutoEstate SMTP settings. If you received this, your configuration is working.</p>",
  });
  return true;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function isEmailConfigured(): Promise<boolean> {
  const config = await getSmtpConfig();
  return !!config;
}
