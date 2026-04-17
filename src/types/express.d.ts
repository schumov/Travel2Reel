import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface User {
      id: string;
      email?: string;
      displayName?: string;
      avatarUrl?: string | null;
    }

    interface Request {
      user?: User;
      guestKey?: string;
      isGuest?: boolean;
    }
  }
}

export {};
