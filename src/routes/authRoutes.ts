import { Router, Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { prisma } from "../db/client";
import { passport } from "../auth/passport";
import { isGoogleAuthConfigured } from "../config/env";
import { GUEST_COOKIE_NAME, signGuestCookie } from "../auth/guestCookie";

const authRouter = Router();

authRouter.post("/guest", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    // Check if guest access is enabled
    const guestSetting = await prisma.appSetting.findUnique({ where: { key: "guest_access_enabled" } });
    if (guestSetting && guestSetting.value === "false") {
      res.status(403).json({ error: "Guest access is currently disabled" });
      return;
    }

    const guestKey = randomUUID();
    const googleSub = `guest:${guestKey}`;

    const guestUser = await prisma.user.upsert({
      where: { googleSub },
      update: {
        displayName: `Guest ${guestKey.slice(0, 8)}`
      },
      create: {
        googleSub,
        email: `guest-${guestKey}@guest.local`,
        displayName: `Guest ${guestKey.slice(0, 8)}`,
        avatarUrl: null
      }
    });

    res.cookie(GUEST_COOKIE_NAME, signGuestCookie(guestKey), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 90
    });

    res.status(201).json({
      authenticated: true,
      guest: true,
      user: {
        id: guestUser.id,
        email: guestUser.email,
        displayName: guestUser.displayName,
        avatarUrl: guestUser.avatarUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/google", (req: Request, res: Response, next: NextFunction) => {
  if (!isGoogleAuthConfigured) {
    res.status(503).json({ error: "Google auth is not configured" });
    return;
  }

  passport.authenticate("google", { scope: ["profile", "email"] })(req, res, next);
});

authRouter.get(
  "/google/callback",
  (req: Request, res: Response, next: NextFunction) => {
    if (!isGoogleAuthConfigured) {
      res.status(503).json({ error: "Google auth is not configured" });
      return;
    }

    passport.authenticate("google", {
      failureRedirect: "/?auth=failed"
    })(req, res, next);
  },
  (_req: Request, res: Response) => {
    res.redirect("/?auth=ok");
  }
);

authRouter.get("/me", (req: Request, res: Response) => {
  if (!req.user) {
    res.status(200).json({ authenticated: false });
    return;
  }

  res.status(200).json({
    authenticated: true,
    guest: Boolean(req.isGuest),
    user: {
      id: req.user.id,
      email: req.user.email,
      displayName: req.user.displayName,
      avatarUrl: req.user.avatarUrl
    }
  });
});

authRouter.post("/logout", (req: Request, res: Response, next: NextFunction) => {
  req.logout((error) => {
    if (error) {
      next(error);
      return;
    }

    req.session.destroy((destroyError) => {
      if (destroyError) {
        next(destroyError);
        return;
      }

      res.clearCookie("connect.sid");
      res.clearCookie(GUEST_COOKIE_NAME);
      res.status(200).json({ success: true });
    });
  });
});

export { authRouter };
