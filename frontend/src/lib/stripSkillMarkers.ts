/**
 * Strip agent skill markers from text (same behavior as backend helpers).
 * Keeps inbox/playground display aligned with what we send to WhatsApp.
 */
export function stripSkillMarkers(content: string): string {
  let out = content.replace(
    /(?:\r\n|\r|\n)*<!--\s*skill:\S+?(?::complete\s+\{.*?\})?\s*-->/g,
    "",
  );
  const orphan = out.indexOf("<!-- skill:");
  if (orphan >= 0) {
    out = out.slice(0, orphan).trimEnd();
  }
  return out;
}
