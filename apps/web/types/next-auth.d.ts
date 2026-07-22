import type { Role } from "@ecommerce-orderflow/domain";
import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    role: Role;
    userId: string;
    idToken: string;
    error?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
    expiresAt?: number;
    role?: Role;
    error?: string;
  }
}
