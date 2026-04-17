import { NextFunction, Request, Response } from "express";
import { prisma } from "../db/client";
import { GUEST_COOKIE_NAME, parseCookie, verifyGuestCookie } from "../auth/guestCookie";

export async function attachGuestUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (req.user?.id) {
    req.isGuest = false;
    next();
    return;
  }

  const rawCookie = parseCookie(req.headers.cookie, GUEST_COOKIE_NAME);
  const guestKey = verifyGuestCookie(rawCookie);

  if (!guestKey) {
    req.guestKey = undefined;
    req.isGuest = false;
    next();
    return;
  }

  try {
    // Check if guest access is globally enabled
    const guestSetting = await prisma.appSetting.findUnique({ where: { key: "guest_access_enabled" } });
    if (guestSetting && guestSetting.value === "false") {
      res.clearCookie(GUEST_COOKIE_NAME);
      req.guestKey = undefined;
      req.isGuest = false;
      next();
      return;
    }

    const guestUser = await prisma.user.findUnique({
      where: { googleSub: `guest:${guestKey}` }
    });

    if (!guestUser || !guestUser.isEnabled) {
      res.clearCookie(GUEST_COOKIE_NAME);
      req.guestKey = undefined;
      req.isGuest = false;
      next();
      return;
    }

    req.user = guestUser;
    req.guestKey = guestKey;
    req.isGuest = true;
    next();
  } catch (error) {
    next(error);
  }
}
