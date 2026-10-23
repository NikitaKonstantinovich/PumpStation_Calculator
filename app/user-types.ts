export const USER_ROLES = ["base", "plus", "pro", "admin"] as const;
export type UserRole = typeof USER_ROLES[number];
export const isUserRole = (value: unknown): value is UserRole => USER_ROLES.some(role => role === value);
export const canEditAllSettings = (role: UserRole) => role === "pro" || role === "admin";
export const canEditProjectOptions = (role: UserRole) => role === "plus" || canEditAllSettings(role);
export type AccountUser = { id: string; email: string; name: string; role: UserRole };
export type ManagedUser = AccountUser & { online: boolean; revision: number; verified: boolean };
export type UserForm = { email: string; name: string; role: UserRole; password: string };
