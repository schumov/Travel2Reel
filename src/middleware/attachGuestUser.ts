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
    const guestUser = await prisma.user.findUnique({
      where: { googleSub: `guest:${guestKey}` }
    });

    if (!guestUser) {
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
