export type UserRole = "super_admin" | "branch_admin";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  branch_id: number | null;
}
