export type UserRole = "admin" | "user";
export type AccountUser = { id: string; email: string; name: string; role: UserRole };
export type ManagedUser = AccountUser & { online: boolean; revision: number; verified: boolean };
export type UserForm = { email: string; name: string; role: UserRole; password: string };
