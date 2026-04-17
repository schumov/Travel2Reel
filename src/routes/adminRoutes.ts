import { Router, Request, Response, NextFunction } from "express";
import { promises as fs } from "fs";
import path from "path";
import { prisma } from "../db/client";
import { env } from "../config/env";
import { requireAdmin } from "../middleware/requireAdmin";

const adminRouter = Router();
const storageRoot = path.join(process.cwd(), "storage");

// ─── Auth ─────────────────────────────────────────────────────────────────────

adminRouter.post("/login", (req: Request, res: Response, next: NextFunction): void => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  req.session.regenerate((err) => {
    if (err) { next(err); return; }
    req.session.isAdmin = true;
    req.session.save((saveErr) => {
      if (saveErr) { next(saveErr); return; }
      res.status(200).json({ ok: true });
    });
  });
});

adminRouter.post("/logout", (req: Request, res: Response, next: NextFunction): void => {
  req.session.destroy((err) => {
    if (err) { next(err); return; }
    res.status(200).json({ ok: true });
  });
});

adminRouter.get("/me", (req: Request, res: Response): void => {
  res.status(200).json({ authenticated: req.session.isAdmin === true });
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const ALLOWED_SETTINGS = ["guest_access_enabled"] as const;
type AllowedSetting = (typeof ALLOWED_SETTINGS)[number];

adminRouter.get("/api/settings", requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rows = await prisma.appSetting.findMany();
    // Build a full defaults map, override with DB values
    const defaults: Record<AllowedSetting, string> = { guest_access_enabled: "true" };
    const result = { ...defaults };
    for (const row of rows) {
      if (ALLOWED_SETTINGS.includes(row.key as AllowedSetting)) {
        result[row.key as AllowedSetting] = row.value;
      }
    }
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/api/settings", requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key, value } = req.body as { key?: string; value?: string };
    if (!key || !ALLOWED_SETTINGS.includes(key as AllowedSetting)) {
      res.status(400).json({ error: `Unknown setting key. Allowed: ${ALLOWED_SETTINGS.join(", ")}` });
      return;
    }
    if (value !== "true" && value !== "false") {
      res.status(400).json({ error: "Value must be 'true' or 'false'" });
      return;
    }
    await prisma.appSetting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
    res.status(200).json({ key, value });
  } catch (error) {
    next(error);
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────

adminRouter.get("/api/users", requireAdmin, async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        googleSub: true,
        isEnabled: true,
        createdAt: true,
        _count: { select: { routeSessions: true } }
      }
    });
    const result = users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      isGuest: u.googleSub.startsWith("guest:"),
      isEnabled: u.isEnabled,
      createdAt: u.createdAt,
      routeCount: u._count.routeSessions
    }));
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
});

adminRouter.patch("/api/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params["id"] as string;
    const { isEnabled } = req.body as { isEnabled?: boolean };
    if (typeof isEnabled !== "boolean") {
      res.status(400).json({ error: "isEnabled must be a boolean" });
      return;
    }
    const updated = await prisma.user.update({
      where: { id },
      data: { isEnabled },
      select: { id: true, isEnabled: true }
    });
    res.status(200).json(updated);
  } catch (error) {
    next(error);
  }
});

adminRouter.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = req.params["id"] as string;

    // Collect all routeSession IDs before deleting from DB
    const sessions = await prisma.routeSession.findMany({
      where: { userId: id },
      select: { id: true }
    });

    // Delete user (cascades to sessions, images, assets in DB)
    await prisma.user.delete({ where: { id } });

    // Remove storage directories for all route sessions
    const errors: string[] = [];
    for (const session of sessions) {
      const dir = path.join(storageRoot, session.id);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch (fsErr) {
        const msg = fsErr instanceof Error ? fsErr.message : String(fsErr);
        errors.push(`${session.id}: ${msg}`);
        console.error(`[admin] Failed to remove storage dir ${dir}:`, fsErr);
      }
    }

    res.status(200).json({
      deleted: true,
      sessionsRemoved: sessions.length,
      ...(errors.length > 0 ? { storageErrors: errors } : {})
    });
  } catch (error) {
    next(error);
  }
});

export { adminRouter };
