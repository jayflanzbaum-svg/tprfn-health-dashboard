export const ADMIN_ROLE = 'admin';

export function hasAdminRole(roles: readonly string[]): boolean {
  return roles.includes(ADMIN_ROLE);
}
