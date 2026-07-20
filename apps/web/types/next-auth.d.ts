import type { Role } from "@ecommerce-orderflow/domain";
import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken: string;
    role: Role;
    userId: string;
    idToken: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    role?: Role;
    idToken?: string;
  }
}
