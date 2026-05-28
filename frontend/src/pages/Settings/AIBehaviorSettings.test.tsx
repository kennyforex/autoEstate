import type { ReactNode } from "react";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AIBehaviorSettings } from "./AIBehaviorSettings";
import type { ModerationSettings } from "../../lib/types";

const translations: Record<string, string> = {
  "settings.aiBehavior.title": "AI Behavior",
  "settings.aiBehavior.subtitle": "Configure bad wording",
  "settings.aiBehavior.dualGateHint": "Channels:",
  "settings.aiBehavior.channelLink": "Channels",
  "settings.aiBehavior.masterEnable": "Enable detection",
  "settings.aiBehavior.masterEnableDesc": "Master switch",
  "settings.aiBehavior.categoriesTitle": "Word categories",
  "settings.aiBehavior.addCategory": "Add category",
  "settings.aiBehavior.categoryEnabled": "Enabled",
  "settings.aiBehavior.categoryName": "Category name",
  "settings.aiBehavior.phrasesLabel": "Phrases",
  "settings.aiBehavior.phrasesPlaceholder": "one per line",
  "settings.aiBehavior.phrasesHint": "hint",
  "settings.aiBehavior.inboxFolder": "Routes to inbox folder",
  "settings.aiBehavior.spamWarning": "Spam warning",
  "settings.aiBehavior.notifyTitle": "Notification Alert !",
  "settings.aiBehavior.notifyDesc": "desc",
  "settings.aiBehavior.notifyEnabled": "Notify",
  "settings.aiBehavior.notifyEnabledDesc": "notify desc",
  "settings.aiBehavior.notifyPhone": "WhatsApp numbers",
  "settings.aiBehavior.notifyPhoneHint": "phone hint",
  "settings.aiBehavior.notifyEmails": "Email addresses",
  "settings.aiBehavior.notifyEmailsHint": "email hint",
  "settings.aiBehavior.notifyRecipientsRequired":
    "Enter at least one WhatsApp number or email address, or turn off alerts.",
  "settings.aiBehavior.notifyEmailInvalid":
    "One or more email addresses are invalid.",
  "settings.aiBehavior.notifyPrivacy": "privacy",
  "settings.aiBehavior.unnamedCategory": "Unnamed",
  "settings.aiBehavior.saveFailed": "Save failed",
  "settings.aiBehavior.saving": "Saving",
  "settings.aiBehavior.folders.attention": "Needs attention",
  "settings.aiBehavior.folders.negative": "Negative sentiment",
  "settings.aiBehavior.folders.priority": "AI priority",
  "settings.aiBehavior.folders.slaRisk": "SLA risk",
  "settings.aiBehavior.folders.spam": "Spam",
  "common.save": "Save Changes",
  "common.saved": "Saved",
};

const t = (key: string) => translations[key] ?? key;

const mockSettings: ModerationSettings = {
  enabled: true,
  notifyEnabled: true,
  notifyPhoneNumbers: ["85261218051", "85266881111"],
  notifyEmails: ["manager@example.com"],
  categories: [
    {
      id: "cat-1",
      name: "English profanity",
      enabled: true,
      phrases: ["fuck"],
      inboxFolder: "attention",
    },
  ],
};

const get = vi.fn();
const update = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t }),
}));

vi.mock("../../context/AuthContext", () => ({
  useAuth: () => ({ user: { role: "admin" } }),
}));

vi.mock("../../lib/api", () => ({
  companyApi: {
    get: (...args: unknown[]) => get(...args),
    update: (...args: unknown[]) => update(...args),
  },
}));

vi.mock("../../components/common", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
  Input: ({
    label,
    value,
    onChange,
    disabled,
  }: {
    label?: string;
    value?: string;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
      />
    </label>
  ),
  Select: ({
    label,
    value,
    onChange,
    options,
    disabled,
  }: {
    label?: string;
    value?: string;
    onChange?: (value: string) => void;
    options: { value: string; label: string }[];
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  ),
  Toggle: ({
    label,
    checked,
    onChange,
    disabled,
  }: {
    label?: string;
    checked?: boolean;
    onChange?: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <label>
      {label}
      <input
        type="checkbox"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </label>
  ),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AIBehaviorSettings />
    </MemoryRouter>,
  );
}

describe("AIBehaviorSettings", () => {
  beforeEach(() => {
    get.mockReset();
    update.mockReset();
    vi.stubGlobal("alert", vi.fn());
    get.mockResolvedValue({ moderationSettings: mockSettings });
    update.mockResolvedValue({ moderationSettings: mockSettings });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders notify recipient fields when alerts enabled", async () => {
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText("WhatsApp numbers")).toBeInTheDocument();
    });
    expect(screen.getByLabelText("Email addresses")).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("85261218051, 85266881111"),
    ).toBeInTheDocument();
    expect(
      screen.getByDisplayValue("manager@example.com"),
    ).toBeInTheDocument();
  });

  it("save calls companyApi.update with comma-separated arrays", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("WhatsApp numbers"));
    await user.type(
      screen.getByLabelText("WhatsApp numbers"),
      "85291111111, 85292222222",
    );
    await user.clear(screen.getByLabelText("Email addresses"));
    await user.type(
      screen.getByLabelText("Email addresses"),
      "manager@example.com, ops@example.com",
    );
    await user.click(screen.getByText("Save Changes"));

    await waitFor(() => {
      expect(update).toHaveBeenCalledTimes(1);
    });

    const payload = update.mock.calls[0][0] as {
      moderationSettings: ModerationSettings;
    };
    expect(payload.moderationSettings.notifyPhoneNumbers).toEqual([
      "85291111111",
      "85292222222",
    ]);
    expect(payload.moderationSettings.notifyEmails).toEqual([
      "manager@example.com",
      "ops@example.com",
    ]);
  });

  it("alerts when enabled with no recipients", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({
      moderationSettings: {
        ...mockSettings,
        notifyPhoneNumbers: [],
        notifyEmails: [],
      },
    });
    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Save Changes")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Save Changes"));

    expect(globalThis.alert).toHaveBeenCalledWith(
      translations["settings.aiBehavior.notifyRecipientsRequired"],
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("alerts on invalid email addresses", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText("Email addresses")).toBeInTheDocument();
    });

    await user.clear(screen.getByLabelText("Email addresses"));
    await user.type(screen.getByLabelText("Email addresses"), "not-an-email");
    await user.click(screen.getByText("Save Changes"));

    expect(globalThis.alert).toHaveBeenCalledWith(
      translations["settings.aiBehavior.notifyEmailInvalid"],
    );
    expect(update).not.toHaveBeenCalled();
  });
});
