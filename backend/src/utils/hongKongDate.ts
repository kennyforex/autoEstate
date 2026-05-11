const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";
const HONG_KONG_OFFSET = "+08:00";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

export type HongKongDateParseResult =
  | {
      ok: true;
      sourceText: string;
      isoDate: string;
      daysFromToday: number;
      relativeLabel: string;
    }
  | {
      ok: false;
      sourceText: string;
      reason: string;
    };

export type HongKongDateOptions = {
  now?: Date;
};

type HongKongDateParts = {
  year: number;
  month: number;
  day: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function partsToIsoDate(parts: HongKongDateParts): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function isoDateToParts(isoDate: string): HongKongDateParts | null {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function dateOnlyToUtcMs(isoDate: string): number {
  const parts = isoDateToParts(isoDate);
  if (!parts) return Number.NaN;
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

function dateFromHongKongParts(parts: HongKongDateParts, time = "00:00:00"): Date {
  return new Date(`${partsToIsoDate(parts)}T${time}${HONG_KONG_OFFSET}`);
}

function isValidHongKongDate(parts: HongKongDateParts): boolean {
  if (!Number.isInteger(parts.year) || !Number.isInteger(parts.month) || !Number.isInteger(parts.day)) {
    return false;
  }
  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > 31) return false;
  const normalized = formatHongKongDateOnly(dateFromHongKongParts(parts));
  return normalized === partsToIsoDate(parts);
}

function addDays(isoDate: string, days: number): string {
  const ms = dateOnlyToUtcMs(isoDate);
  const d = new Date(ms + days * MS_PER_DAY);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function formatHongKongDateOnly(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return partsToIsoDate({
    year: value("year"),
    month: value("month"),
    day: value("day"),
  });
}

export function daysFromHongKongToday(isoDate: string, options: HongKongDateOptions = {}): number {
  const today = formatHongKongDateOnly(options.now ?? new Date());
  return Math.round((dateOnlyToUtcMs(isoDate) - dateOnlyToUtcMs(today)) / MS_PER_DAY);
}

function relativeLabel(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  if (days > 1) return `in ${days} days`;
  return `${Math.abs(days)} days ago`;
}

function okResult(sourceText: string, isoDate: string, options: HongKongDateOptions): HongKongDateParseResult {
  const daysFromToday = daysFromHongKongToday(isoDate, options);
  return {
    ok: true,
    sourceText,
    isoDate,
    daysFromToday,
    relativeLabel: relativeLabel(daysFromToday),
  };
}

function invalidResult(sourceText: string, reason: string): HongKongDateParseResult {
  return { ok: false, sourceText, reason };
}

function normalizeMonthDayYear(
  sourceText: string,
  month: number,
  day: number,
  explicitYear: number | undefined,
  options: HongKongDateOptions,
): HongKongDateParseResult {
  const todayParts = isoDateToParts(formatHongKongDateOnly(options.now ?? new Date()))!;
  const year = explicitYear ?? todayParts.year;
  const parts = { year, month, day };
  if (!isValidHongKongDate(parts)) {
    return invalidResult(sourceText, `Invalid Hong Kong calendar date: ${sourceText}`);
  }

  let isoDate = partsToIsoDate(parts);
  if (explicitYear === undefined && daysFromHongKongToday(isoDate, options) < 0) {
    const nextYearParts = { ...parts, year: parts.year + 1 };
    if (isValidHongKongDate(nextYearParts)) {
      isoDate = partsToIsoDate(nextYearParts);
    }
  }
  return okResult(sourceText, isoDate, options);
}

export function parseHongKongDateMention(
  input: string,
  options: HongKongDateOptions = {},
): HongKongDateParseResult {
  const text = input.trim();
  if (!text) return invalidResult(input, "No date text provided.");

  const lower = text.toLowerCase();
  const today = formatHongKongDateOnly(options.now ?? new Date());

  if (/\b(today|tdy)\b|今日|今天/.test(lower)) {
    return okResult("today", today, options);
  }
  if (/\b(tomorrow|tmr|tmrw)\b|聽日|明天|明日/.test(lower)) {
    return okResult("tomorrow", addDays(today, 1), options);
  }

  const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const isoDate = isoMatch[0];
    const parts = isoDateToParts(isoDate);
    if (!parts || !isValidHongKongDate(parts)) {
      return invalidResult(isoDate, `Invalid Hong Kong calendar date: ${isoDate}`);
    }
    return okResult(isoDate, isoDate, options);
  }

  const monthNamePattern = Object.keys(MONTHS).join("|");
  const monthDayMatch = text.match(
    new RegExp(`\\b(${monthNamePattern})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, "i"),
  );
  if (monthDayMatch) {
    return normalizeMonthDayYear(
      monthDayMatch[0],
      MONTHS[monthDayMatch[1].toLowerCase()],
      Number(monthDayMatch[2]),
      monthDayMatch[3] ? Number(monthDayMatch[3]) : undefined,
      options,
    );
  }

  const numericDateMatch = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (numericDateMatch) {
    return normalizeMonthDayYear(
      numericDateMatch[0],
      Number(numericDateMatch[1]),
      Number(numericDateMatch[2]),
      numericDateMatch[3] ? Number(numericDateMatch[3]) : undefined,
      options,
    );
  }

  return invalidResult(input, "No supported date mention found.");
}

export function validateMinimumLeadDays(
  isoDate: string,
  minimumDays: number,
  options: HongKongDateOptions = {},
): { ok: true; daysFromToday: number } | { ok: false; daysFromToday: number; reason: string } {
  const parts = isoDateToParts(isoDate);
  if (!parts || !isValidHongKongDate(parts)) {
    return {
      ok: false,
      daysFromToday: Number.NaN,
      reason: `Invalid Hong Kong calendar date: ${isoDate}`,
    };
  }

  const daysFromToday = daysFromHongKongToday(isoDate, options);
  if (daysFromToday < minimumDays) {
    return {
      ok: false,
      daysFromToday,
      reason: `Pickup date must be at least ${minimumDays} days from today.`,
    };
  }
  return { ok: true, daysFromToday };
}

export function buildHongKongDateFacts(input: string, options: HongKongDateOptions = {}): string {
  const parsed = parseHongKongDateMention(input, options);
  if (!parsed.ok) return "";

  const leadTime = validateMinimumLeadDays(parsed.isoDate, 2, options);
  const policyText = leadTime.ok
    ? "passes the standard 48-hour lead-time policy"
    : `does not pass the standard 48-hour lead-time policy: ${leadTime.reason}`;

  return [
    "SYSTEM DATE FACTS (Hong Kong Time):",
    `- Today: ${formatHongKongDateOnly(options.now ?? new Date())}`,
    `- Customer date text: ${parsed.sourceText} -> ${parsed.isoDate}`,
    `- Relative timing: ${parsed.daysFromToday} days from today (${parsed.relativeLabel})`,
    `- Cake booking policy: ${policyText}`,
    "- Use these facts for all date wording. Do not invent a different relative label.",
  ].join("\n");
}

export function normalizeHongKongDateTimeInput(input: string, options: { defaultTime?: string } = {}): string {
  const value = input.trim();
  if (!value) {
    throw new Error("Date/time is required.");
  }

  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const parts = isoDateToParts(value);
    if (!parts || !isValidHongKongDate(parts)) {
      throw new Error(`Invalid Hong Kong calendar date: ${value}`);
    }
    const time = options.defaultTime ?? "00:00";
    if (!/^\d{2}:\d{2}$/.test(time)) {
      throw new Error(`Invalid default time: ${time}`);
    }
    return `${value}T${time}:00${HONG_KONG_OFFSET}`;
  }

  const localDateTime = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?$/);
  if (localDateTime) {
    const parts = isoDateToParts(localDateTime[1]);
    if (!parts || !isValidHongKongDate(parts)) {
      throw new Error(`Invalid Hong Kong calendar date: ${localDateTime[1]}`);
    }
    return `${localDateTime[1]}T${localDateTime[2]}:${localDateTime[3] ?? "00"}${HONG_KONG_OFFSET}`;
  }

  const withZone = value.match(/^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/);
  if (withZone) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new Error(`Invalid ISO date/time: ${value}`);
    }
    return value;
  }

  throw new Error(`Unsupported date/time format: ${input}`);
}
