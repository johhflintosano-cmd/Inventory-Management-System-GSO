import "express-session";
import type { SafeUser } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    role?: "admin" | "employee";
    twoFactorVerified?: boolean;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: SafeUser;
    }
  }
}
