/**
 * LLMs sometimes compress menu choices into one paragraph even when the skill
 * asks for line-by-line output. Normalize common keycap-number menus before
 * the response is saved/rendered.
 */
export function normalizeNumberedMenuLineBreaks(text: string): string {
  if (!/1\uFE0F?\u20E3/.test(text) || !/2\uFE0F?\u20E3/.test(text)) {
    return text;
  }

  return text
    .replace(/([^\n])[^\S\r\n]+(1\uFE0F?\u20E3\s+)/g, "$1\n$2")
    .replace(/[^\S\r\n]+((?:[2-9]|1[0-9])\uFE0F?\u20E3\s+)/g, "\n$1");
}
