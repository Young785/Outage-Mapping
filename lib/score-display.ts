/**
 * Display priority as a simple 0–100 score.
 * Internal routing may still use larger raw totals; clamp for humans.
 */

/** Typical ceiling for legacy + V1 blended raw scores before display. */
export const PRIORITY_SCORE_CEILING = 400;

/** Map any raw priority total onto a 0–100 scale (order-preserving). */
export function toPriority100(raw: number, ceiling = PRIORITY_SCORE_CEILING): number {
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((raw / ceiling) * 100)));
}
