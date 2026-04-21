import { ShippingMethod, type IShippingMethodDocument } from "../models/index.js";

export type ShippingMethodSummary = {
  id: string;
  labelZh: string;
  labelEn: string;
  fee: number;
  sortOrder: number;
  isActive: boolean;
};

export type ResolveShippingResult =
  | {
      kind: "configured";
      method: ShippingMethodSummary;
      normalizedLabel: string;
      normalizedFee: number;
    }
  | {
      kind: "custom";
      normalizedLabel: string | undefined;
      normalizedFee: number | undefined;
    };

function clampMoney(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function normalizeText(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  return s ? s : undefined;
}

function toSummary(doc: IShippingMethodDocument): ShippingMethodSummary {
  return {
    id: doc._id.toString(),
    labelZh: doc.labelZh ?? "",
    labelEn: doc.labelEn ?? "",
    fee: clampMoney(doc.fee),
    sortOrder: typeof doc.sortOrder === "number" ? doc.sortOrder : 0,
    isActive: doc.isActive !== false,
  };
}

function labelMatches(doc: ShippingMethodSummary, input: string): boolean {
  const raw = input.trim().toLowerCase();
  if (!raw) return false;
  const zh = (doc.labelZh || "").trim().toLowerCase();
  const en = (doc.labelEn || "").trim().toLowerCase();
  return (zh.length > 0 && zh === raw) || (en.length > 0 && en === raw);
}

export class ShippingService {
  async list(args?: {
    includeInactive?: boolean;
  }): Promise<ShippingMethodSummary[]> {
    const includeInactive = args?.includeInactive === true;
    const query = includeInactive ? {} : { isActive: true };
    const docs = await ShippingMethod.find(query).sort({ sortOrder: 1, labelZh: 1 });
    return docs.map(toSummary);
  }

  async resolveShipping(args: {
    shippingMethod?: unknown;
    shippingFee?: unknown;
    includeInactive?: boolean;
  }): Promise<ResolveShippingResult> {
    const methodText = normalizeText(args.shippingMethod);
    const feeNumber =
      args.shippingFee === undefined ? undefined : clampMoney(args.shippingFee);

    if (!methodText) {
      return {
        kind: "custom",
        normalizedLabel: undefined,
        normalizedFee: feeNumber,
      };
    }

    const methods = await this.list({ includeInactive: args.includeInactive === true });
    const matched = methods.find((m) => labelMatches(m, methodText));
    if (!matched) {
      return {
        kind: "custom",
        normalizedLabel: methodText,
        normalizedFee: feeNumber,
      };
    }

    const normalizedLabel = matched.labelZh?.trim() ? matched.labelZh.trim() : matched.labelEn;
    const normalizedFee = matched.fee;
    return { kind: "configured", method: matched, normalizedLabel, normalizedFee };
  }
}

export const shippingService = new ShippingService();

