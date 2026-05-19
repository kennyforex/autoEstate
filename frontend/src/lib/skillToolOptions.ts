import { getSkillToolCatalogEntry, SKILL_TOOL_CATALOG } from "./skillToolCatalog";

export interface SkillToolOption {
  id: string;
  label: string;
  description: string;
  usage: string;
  parametersHelp: string;
  parameters: Record<string, unknown>;
  example: string;
}

const EMPTY_PARAMETERS: Record<string, unknown> = {
  type: "object",
  properties: {},
};

/** Normalize API payloads (supports legacy `{ id, label }` responses). */
export function normalizeSkillToolOption(
  raw: Partial<SkillToolOption> & Pick<SkillToolOption, "id">,
): SkillToolOption {
  const fallback = getSkillToolCatalogEntry(raw.id);
  const hasParameters =
    raw.parameters &&
    typeof raw.parameters === "object" &&
    raw.parameters.properties &&
    typeof raw.parameters.properties === "object" &&
    !Array.isArray(raw.parameters.properties) &&
    Object.keys(raw.parameters.properties as object).length > 0;

  return {
    id: raw.id,
    label: raw.label ?? raw.id.replace(/_/g, " "),
    description: raw.description ?? fallback?.description ?? "",
    usage: raw.usage ?? fallback?.usage ?? "",
    parametersHelp: raw.parametersHelp ?? fallback?.parametersHelp ?? "",
    parameters: hasParameters ? raw.parameters! : EMPTY_PARAMETERS,
    example: raw.example ?? fallback?.example ?? "",
  };
}

export function parseRequiredTools(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function formatRequiredTools(ids: string[]): string {
  return ids.join(", ");
}

export function toggleRequiredTool(
  csv: string,
  toolId: string,
  enabled: boolean,
): string {
  const current = parseRequiredTools(csv);
  const next = enabled
    ? current.includes(toolId)
      ? current
      : [...current, toolId]
    : current.filter((x) => x !== toolId);
  return formatRequiredTools(next);
}

export function isRequiredToolSelected(csv: string, toolId: string): boolean {
  return parseRequiredTools(csv).includes(toolId);
}

/** Client fallback when API omits example. */
export function buildExampleFromParameters(
  parameters?: Record<string, unknown>,
): string {
  if (!parameters) return "{}";
  const props = parameters.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) {
    return "{}";
  }
  const required = Array.isArray(parameters.required)
    ? (parameters.required as string[])
    : [];
  const keys =
    required.length > 0
      ? required
      : Object.keys(props as Record<string, unknown>);
  const example: Record<string, unknown> = {};
  for (const key of keys) {
    const schema = (props as Record<string, unknown>)[key];
    example[key] = stubValueForSchema(schema);
  }
  return JSON.stringify(example, null, 2);
}

function stubValueForSchema(schema: unknown): unknown {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    return "...";
  }
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return s.enum[0];
  }
  const type = s.type;
  if (type === "string") return "...";
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (type === "array") {
    const items = s.items;
    if (items && typeof items === "object" && !Array.isArray(items)) {
      const itemSchema = items as Record<string, unknown>;
      if (Array.isArray(itemSchema.enum) && itemSchema.enum.length > 0) {
        return [itemSchema.enum[0]];
      }
      const itemType = itemSchema.type;
      if (itemType === "string") return ["..."];
      if (itemType === "number" || itemType === "integer") return [0];
    }
    return [];
  }
  if (type === "object") {
    const nested = s.properties;
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
        obj[k] = stubValueForSchema(v);
      }
      return obj;
    }
    return {};
  }
  return "...";
}

export function resolveToolExample(tool: SkillToolOption): string {
  if (tool.example?.trim()) return tool.example;
  return buildExampleFromParameters(tool.parameters ?? EMPTY_PARAMETERS);
}

export function hasParameterProperties(
  parameters?: Record<string, unknown>,
): boolean {
  const props = parameters?.properties;
  return (
    !!props &&
    typeof props === "object" &&
    !Array.isArray(props) &&
    Object.keys(props as object).length > 0
  );
}

/**
 * Union API tool list with frontend SKILL_TOOL_CATALOG so new tools appear in the
 * Skill Tools tab before the backend process is restarted (catalog is source for missing ids).
 */
export function mergeSkillToolOptionsWithCatalog(
  apiTools: SkillToolOption[],
): SkillToolOption[] {
  const byId = new Map(apiTools.map((t) => [t.id, t]));
  for (const id of Object.keys(SKILL_TOOL_CATALOG)) {
    if (!byId.has(id)) {
      byId.set(id, normalizeSkillToolOption({ id }));
    }
  }
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}
