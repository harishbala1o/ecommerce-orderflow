export const ROLES = ["customer", "ops", "admin"] as const;

export type Role = (typeof ROLES)[number];
