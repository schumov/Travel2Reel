import { Router, Request, Response, NextFunction } from "express";
import { createRenderCacheKey, renderCache } from "../services/cacheService";
import { renderMapPng } from "../services/mapRenderService";
import { validateRenderMapQuery } from "../utils/validators";

const mapRouter = Router();

mapRouter.get("/cache/health", (_req: Request, res: Response) => {
  res.status(200).json({
    status: "ok",
    backend: renderCache.getBackendName()
  });
});

mapRouter.get("/render", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const params = validateRenderMapQuery(req.query);
    const cacheKey = createRenderCacheKey(params);
    const cached = await renderCache.get(cacheKey);

    if (cached) {
      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Map-Center", `${params.lat},${params.lng}`);
      res.setHeader("X-Map-Zoom", `${params.zoom}`);
      res.setHeader("X-Map-Width", `${params.width}`);
      res.setHeader("X-Map-Height", `${params.height}`);
      res.status(200).send(cached);
      return;
    }

    const renderedPng = await renderMapPng(params);
  await renderCache.set(cacheKey, renderedPng);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Map-Center", `${params.lat},${params.lng}`);
    res.setHeader("X-Map-Zoom", `${params.zoom}`);
    res.setHeader("X-Map-Width", `${params.width}`);
    res.setHeader("X-Map-Height", `${params.height}`);
    res.status(200).send(renderedPng);
  } catch (error) {
    next(error);
  }
});

export { mapRouter };
