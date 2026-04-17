import { NextFunction, Request, Response } from "express";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session.isAdmin !== true) {
    res.status(401).json({ error: "Admin authentication required" });
    return;
  }
  next();
}
