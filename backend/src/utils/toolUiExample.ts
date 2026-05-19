/** Build a minimal JSON example from an OpenAI-style tool parameters schema. */
export function buildExampleFromParameters(
  parameters: Record<string, unknown>,
): string {
  const props = parameters.properties;
  if (!props || typeof props !== 'object' || Array.isArray(props)) {
    return '{}';
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
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return '...';
  }
  const s = schema as Record<string, unknown>;
  if (Array.isArray(s.enum) && s.enum.length > 0) {
    return s.enum[0];
  }
  const type = s.type;
  if (type === 'string') return '...';
  if (type === 'number' || type === 'integer') return 0;
  if (type === 'boolean') return false;
  if (type === 'array') {
    const items = s.items;
    if (items && typeof items === 'object' && !Array.isArray(items)) {
      const itemSchema = items as Record<string, unknown>;
      if (Array.isArray(itemSchema.enum) && itemSchema.enum.length > 0) {
        return [itemSchema.enum[0]];
      }
      const itemType = itemSchema.type;
      if (itemType === 'string') return ['...'];
      if (itemType === 'number' || itemType === 'integer') return [0];
    }
    return [];
  }
  if (type === 'object') {
    const nested = s.properties;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const obj: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(nested as Record<string, unknown>)) {
        obj[k] = stubValueForSchema(v);
      }
      return obj;
    }
    return {};
  }
  return '...';
}
