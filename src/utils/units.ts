export const kgToLbs = (kg: number): number => Math.round(kg * 22046) / 10000;  // ×2.2046
export const lbsToKg = (lbs: number): number => Math.round(lbs * 4536) / 10000; // ÷2.2046

export function fmtLbs(kg: number | undefined, decimals = 1): string {
  if (kg == null) return '—';
  return `${kgToLbs(kg).toFixed(decimals)} lbs`;
}
