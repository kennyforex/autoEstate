/** A=1 … Z=26, AA=27 … (for column range width). */
export function spreadsheetColumnLettersToCount(letters: string): number {
  let n = 0;
  for (const c of letters.toUpperCase()) {
    if (c < 'A' || c > 'Z') break;
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n;
}
