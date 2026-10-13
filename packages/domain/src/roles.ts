/**
 * Domain roles.
 *
 * `business_admin` is deliberately NOT called `admin`. Hasura reserves `admin`
 * for a built-in role that bypasses every permission check, so a browser
 * session must never hold it. Keeping the names distinct makes it impossible to
 * grant Hasura's superuser by accident when expressing a business privilege.
 */
export const ROLES = ["customer", "ops", "business_admin"] as const;

export type Role = (typeof ROLES)[number];
