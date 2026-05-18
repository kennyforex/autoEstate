const HONG_KONG_TIME_ZONE = "Asia/Hong_Kong";
const HONG_KONG_OFFSET = "+08:00";

type HongKongParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
};

function getHongKongParts(date: Date): HongKongParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const part = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
}

function parseDeliveryIso(iso?: string): Date | null {
  if (!iso?.trim()) return null;
  const trimmed = iso.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T00:00:00${HONG_KONG_OFFSET}`);
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** API ISO → `YYYY-MM-DDTHH:mm` in Hong Kong for `datetime-local` inputs. */
export function toDatetimeLocalValue(iso?: string): string {
  const date = parseDeliveryIso(iso);
  if (!date) return "";
  const p = getHongKongParts(date);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** `datetime-local` value (HK wall time) → ISO string for the API. */
export function fromDatetimeLocalValue(local?: string): string | undefined {
  const value = local?.trim();
  if (!value) return undefined;

  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) return undefined;

  return `${match[1]}T${match[2]}:00${HONG_KONG_OFFSET}`;
}

export function formatHongKongPickupDate(iso?: string, locale = "en"): string {
  const date = parseDeliveryIso(iso);
  if (!date) return "—";

  return new Intl.DateTimeFormat(locale, {
    timeZone: HONG_KONG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatHongKongPickupTime(iso?: string): string {
  const date = parseDeliveryIso(iso);
  if (!date) return "—";

  const p = getHongKongParts(date);
  if (p.hour === "00" && p.minute === "00") return "—";
  return `${p.hour}:${p.minute}`;
}
