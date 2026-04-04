/**
 * Loose match for HK / international numbers between Sheet text and stored Contact fields.
 */
export function digitsOnly(s: string | undefined): string {
  if (!s) return "";
  return s.replace(/\D/g, "");
}

export function phonesLikelyMatch(a: string, b: string | undefined): boolean {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const min = Math.min(da.length, db.length);
  if (min >= 8) {
    return da.slice(-8) === db.slice(-8);
  }
  return false;
}
