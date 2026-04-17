import { NextFunction, Request, Response } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionAuthenticated = Boolean(req.isAuthenticated && req.isAuthenticated());
  const guestAuthenticated = Boolean(req.user?.id && req.isGuest);

  if (!sessionAuthenticated && !guestAuthenticated) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  next();
}
