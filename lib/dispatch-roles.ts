/** Roles allowed to dispatch / assign jobs (office operations). */
export function canDispatch(role: string): boolean {
  return role === "office" || role === "admin" || role === "owner";
}

export function canManageTerritories(role: string): boolean {
  return canDispatch(role);
}
