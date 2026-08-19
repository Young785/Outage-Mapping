/** Roles allowed to dispatch / assign jobs (office operations). */
export function canDispatch(role: string): boolean {
  return role === "office" || role === "admin" || role === "owner";
}

export function canManageTerritories(role: string): boolean {
  return canDispatch(role);
}

export function isAdminRole(role: string): boolean {
  return role === "admin" || role === "owner";
}

export function isOfficeRole(role: string): boolean {
  return role === "office" || isAdminRole(role);
}

/** Field routing / GPS / Route-to-Next — techs plus admin/owner hybrids. */
export function canFieldRoute(role: string): boolean {
  return role === "tech" || isAdminRole(role);
}

/** Hard investigation gate before next route — tech-only; admins can clear/skip while testing. */
export function requiresInvestigationGate(role: string): boolean {
  return role === "tech";
}
