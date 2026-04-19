import * as exifr from "exifr";
import multer from "multer";
import * as fs from "fs";
import * as path from "path";
import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../db/client";
import { requireAuth } from "../middleware/requireAuth";
import { extractGpsCoordinates, tryExtractGpsCoordinates } from "../services/exifService";
import { fetchLocationInfo } from "../services/locationInfoService";
import {
  renderMapPng,
  renderOrderedRouteMapPng
} from "../services/mapRenderService";
import {
  deleteStorageFile,
  resolveStoragePath,
  saveAssetFile
} from "../services/storageService";
import { processImage } from "../services/imageService";
import { generateImageSummary, translateText, type TranslationLanguage } from "../services/claudeAiService";
import { analyzeImage, DEFAULT_IMAGE_ANALYSIS_URL } from "../services/imageAnalysisService";
import { isClaudeAiConfigured, isVideoGenConfigured, env } from "../config/env";
import { HttpError } from "../utils/validators";
import { extractVideoThumbnail } from "../services/videoThumbnailService";

const userRouter = Router();

/** Extract loggable (non-binary) params from a fetch RequestInit body. */
function extractLogParams(body: RequestInit["body"]): Record<string, unknown> {
  if (!body) return {};
  if (typeof body === "string") {
    try { return JSON.parse(body) as Record<string, unknown>; } catch { return { raw: body.slice(0, 200) }; }
  }
  // FormData — iterate entries, skip binary (Blob/File)
  if (typeof (body as any).entries === "function") {
    const params: Record<string, string> = {};
    for (const [key, value] of (body as any).entries()) {
      if (typeof value === "string") params[key] = value;
    }
    return params;
  }
  return {};
}

/** Wrapper around fetch that logs every request/response to the video-gen API. */
async function videoGenFetch(endpoint: string, init: RequestInit): Promise<globalThis.Response> {
  const url = `${env.VIDEO_GEN_API_URL}${endpoint}`;
  const start = Date.now();
  const params = extractLogParams(init.body);
  const paramsStr = Object.keys(params).length
    ? "  params: " + JSON.stringify(params)
    : "";
  console.log(`[video-gen] --> ${init.method ?? "GET"} ${url}${paramsStr}`);
  const response = await globalThis.fetch(url, init);
  const elapsed = Date.now() - start;
  const level = response.ok ? "info" : "warn";
  console[level](`[video-gen] <-- ${response.status} ${response.statusText}  (${elapsed} ms)  ${url}`);
  return response;
}
const VALID_VIDEO_EFFECTS = ["none", "zoom-in", "zoom-out", "pan-left", "pan-right", "ken-burns", "shake"] as const;

const ASSET_TYPE = {
  ORIGINAL_IMAGE: "ORIGINAL_IMAGE",
  IMAGE_MAP: "IMAGE_MAP",
  ROUTE_MAP: "ROUTE_MAP",
  ORIGINAL_VIDEO: "ORIGINAL_VIDEO",
  VIDEO_THUMBNAIL: "VIDEO_THUMBNAIL"
} as const;
const ROUTE_STATUS = {
  COMPLETED: "COMPLETED"
} as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.VIDEO_MAX_SIZE_MB * 1024 * 1024,
    files: 100
  }
});

const videoUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.VIDEO_MAX_SIZE_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) {
      cb(new HttpError(415, "Only video files are accepted") as unknown as null, false);
    } else {
      cb(null, true);
    }
  }
});

userRouter.use(requireAuth);

function normalizeRouteId(req: Request): string {
  const routeIdParam = req.params.routeId;
  const routeId = Array.isArray(routeIdParam) ? routeIdParam[0] : routeIdParam;

  if (!routeId) {
    throw new HttpError(400, "Route id is required");
  }

  return routeId;
}

function parseDimension(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, "width and height must be integers");
  }

  if (parsed < 256 || parsed > 2200) {
    throw new HttpError(400, "width and height must be between 256 and 2200");
  }

  return parsed;
}

async function loadOwnedRouteSession(userId: string, routeId: string) {
  const routeSession = await prisma.routeSession.findUnique({
    where: { id: routeId },
    include: {
      images: {
        orderBy: {
          orderIndex: "asc"
        }
      },
      assets: true
    }
  });

  if (!routeSession) {
    throw new HttpError(404, "Route session not found");
  }

  if (routeSession.userId !== userId) {
    throw new HttpError(403, "Not allowed to access this route session");
  }

  return routeSession;
}

function assetUrl(assetId: string): string {
  return `/api/user/assets/${assetId}`;
}

function mimeTypeFromProcessedFormat(format: string): string {
  if (format === "jpeg" || format === "jpg") {
    return "image/jpeg";
  }

  if (format === "png") {
    return "image/png";
  }

  if (format === "webp") {
    return "image/webp";
  }

  return "application/octet-stream";
}

userRouter.post("/routes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const title = typeof req.body?.title === "string" && req.body.title.trim().length > 0
      ? req.body.title.trim()
      : `Route ${new Date().toISOString()}`;

    const routeSession = await prisma.routeSession.create({
      data: {
        userId: req.user!.id,
        title
      }
    });

    res.status(201).json({ routeSession });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/routes", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeSessions = await prisma.routeSession.findMany({
      where: {
        userId: req.user!.id
      },
      include: {
        _count: {
          select: {
            images: true,
            assets: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.status(200).json({ routeSessions });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/routes/:routeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);

    const images = routeSession.images.map((image: any) => {
      const imageAssets = routeSession.assets
        .filter((asset: any) => asset.routeImageId === image.id)
        .map((asset: any) => ({
          ...asset,
          url: assetUrl(asset.id)
        }));

      return {
        ...image,
        assets: imageAssets
      };
    });

    const routeMapAssets = routeSession.assets
      .filter((asset: any) => asset.assetType === ASSET_TYPE.ROUTE_MAP)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((asset: any) => ({
        ...asset,
        url: assetUrl(asset.id)
      }));

    res.status(200).json({
      routeSession: {
        ...routeSession,
        images,
        routeMapAssets
      }
    });
  } catch (error) {
    next(error);
  }
});

userRouter.post(
  "/routes/:routeId/images",
  upload.array("images", 100),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const routeId = normalizeRouteId(req);
      const files = req.files as Express.Multer.File[] | undefined;

      if (!files || files.length === 0) {
        throw new HttpError(400, "At least one image file is required in the images field");
      }

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      let orderIndex = routeSession.images.length;
      const uploadedImages: Array<unknown> = [];
      const failedImages: Array<{ filename: string; reason: string }> = [];

      let notesByIndex: string[] = [];
      if (typeof req.body?.noteByIndex === "string") {
        try {
          const parsed = JSON.parse(req.body.noteByIndex);
          if (Array.isArray(parsed)) {
            notesByIndex = parsed.map((entry) => (typeof entry === "string" ? entry.trim() : ""));
          }
        } catch {
          // Ignore invalid note payload and continue without notes.
        }
      }

      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const file = files[fileIndex];

        if (file.mimetype.startsWith("video/")) {
          try {
            const createdVideoImage = await prisma.routeImage.create({
              data: {
                routeSessionId: routeSession.id,
                orderIndex,
                originalFilename: file.originalname,
                mimeType: file.mimetype,
                hasSourceVideo: true
              }
            });
            const videoResult = await saveAssetFile({
              routeSessionId: routeSession.id,
              assetType: ASSET_TYPE.ORIGINAL_VIDEO,
              mimeType: file.mimetype,
              buffer: file.buffer
            });
            const videoAssetRow = await prisma.routeAsset.create({
              data: {
                routeSessionId: routeSession.id,
                routeImageId: createdVideoImage.id,
                assetType: ASSET_TYPE.ORIGINAL_VIDEO,
                storagePath: videoResult.relativePath,
                byteSize: videoResult.byteSize,
                sha256: videoResult.sha256
              }
            });
            uploadedImages.push({
              image: { ...createdVideoImage, isVideoItem: true },
              assets: [{ ...videoAssetRow, url: assetUrl(videoAssetRow.id) }]
            });
            orderIndex += 1;
          } catch (err) {
            failedImages.push({
              filename: file.originalname,
              reason: err instanceof Error ? err.message : "Video upload error"
            });
          }
          continue;
        }

        if (!file.mimetype.startsWith("image/")) {
          failedImages.push({
            filename: file.originalname,
            reason: `Unsupported file type "${file.mimetype}". Only image files (JPEG, PNG, WebP) are accepted.`
          });
          continue;
        }

        try {
          const processed = await processImage(file.buffer);
          const processedMimeType = mimeTypeFromProcessedFormat(processed.format);
          const gps = await tryExtractGpsCoordinates(file.buffer);
          const exifPayload = await exifr.parse(file.buffer).catch(() => null);

          const capturedDate = exifPayload && (exifPayload as { DateTimeOriginal?: Date; CreateDate?: Date }).DateTimeOriginal
            ? (exifPayload as { DateTimeOriginal?: Date }).DateTimeOriginal
            : exifPayload && (exifPayload as { CreateDate?: Date }).CreateDate
              ? (exifPayload as { CreateDate?: Date }).CreateDate
              : null;

          // Fetch settings once for both analysis URL and caption prompt
          const [analysisSetting, promptSetting] = await Promise.all([
            prisma.appSetting.findUnique({ where: { key: "image_analysis_api_url" } }),
            prisma.appSetting.findUnique({ where: { key: "caption_prompt" } })
          ]);
          const analysisApiUrl = analysisSetting?.value ?? DEFAULT_IMAGE_ANALYSIS_URL;

          // Phase 1 — parallel: location info + image analysis (neither needs a DB record yet)
          const [locationInfo, imageAnalysis] = await Promise.all([
            gps
              ? fetchLocationInfo(gps).catch(() => ({ gps, displayName: "Unknown location" }))
              : Promise.resolve(null),
            analyzeImage(processed.buffer, processedMimeType, analysisApiUrl)
          ]);

          // Create DB record with all available context from phase 1
          const createdImage = await prisma.routeImage.create({
            data: {
              routeSessionId: routeSession.id,
              orderIndex,
              originalFilename: file.originalname,
              mimeType: processedMimeType,
              capturedAt: capturedDate,
              gpsLat: gps?.lat ?? null,
              gpsLng: gps?.lng ?? null,
              exifJson: exifPayload ? JSON.stringify(exifPayload) : null,
              locationInfoJson: locationInfo ? JSON.stringify(locationInfo) : null,
              userNote: notesByIndex[fileIndex] || null
            }
          });

          const originalAsset = await saveAssetFile({
            routeSessionId: routeSession.id,
            assetType: ASSET_TYPE.ORIGINAL_IMAGE,
            mimeType: processedMimeType,
            buffer: processed.buffer
          });

          const originalAssetRow = await prisma.routeAsset.create({
            data: {
              routeSessionId: routeSession.id,
              routeImageId: createdImage.id,
              assetType: ASSET_TYPE.ORIGINAL_IMAGE,
              storagePath: originalAsset.relativePath,
              byteSize: originalAsset.byteSize,
              sha256: originalAsset.sha256
            }
          });

          const imageAssets: unknown[] = [{ ...originalAssetRow, url: assetUrl(originalAssetRow.id) }];

          // Phase 2 — parallel: map rendering + caption generation
          // Both can run concurrently since they are independent of each other
          const mapTask = gps
            ? (async () => {
                const mapBuffer = await renderMapPng({
                  lat: gps.lat,
                  lng: gps.lng,
                  zoom: 13,
                  width: 460,
                  height: 280
                });
                const mapAsset = await saveAssetFile({
                  routeSessionId: routeSession.id,
                  assetType: ASSET_TYPE.IMAGE_MAP,
                  mimeType: "image/png",
                  buffer: mapBuffer
                });
                const mapAssetRow = await prisma.routeAsset.create({
                  data: {
                    routeSessionId: routeSession.id,
                    routeImageId: createdImage.id,
                    assetType: ASSET_TYPE.IMAGE_MAP,
                    storagePath: mapAsset.relativePath,
                    byteSize: mapAsset.byteSize,
                    sha256: mapAsset.sha256
                  }
                });
                return mapAssetRow;
              })().catch(() => null)
            : Promise.resolve(null);

          const captionTask = isClaudeAiConfigured
            ? generateImageSummary({
                userNote: notesByIndex[fileIndex] || null,
                locationInfo,
                originalFilename: file.originalname,
                imageAnalysis
              }, promptSetting?.value ?? undefined).catch(() => null)
            : Promise.resolve(null);

          const [mapAssetRow, aiSummary] = await Promise.all([mapTask, captionTask]);

          if (mapAssetRow) {
            imageAssets.push({ ...mapAssetRow, url: assetUrl(mapAssetRow.id) });
          }

          // Single DB update with analysis result and generated captions
          let finalImage: typeof createdImage = (imageAnalysis !== null || aiSummary !== null)
            ? await prisma.routeImage.update({
                where: { id: createdImage.id },
                data: {
                  ...(imageAnalysis !== null ? { imageAnalysis } : {}),
                  ...(aiSummary !== null ? { aiSummary } : {})
                }
              })
            : createdImage;

          // Phase 3 — auto-generate video if service is configured and a caption is available
          if (isVideoGenConfigured && aiSummary) {
            try {
              const randomEffect = VALID_VIDEO_EFFECTS[Math.floor(Math.random() * VALID_VIDEO_EFFECTS.length)];
              const videoFormData = new FormData();
              const imageBlob = new Blob([new Uint8Array(processed.buffer.buffer as ArrayBuffer, processed.buffer.byteOffset, processed.buffer.byteLength)], { type: processedMimeType });
              videoFormData.append("image", imageBlob, file.originalname);
              videoFormData.append("text", aiSummary.trim());
              videoFormData.append("effect", randomEffect);
              videoFormData.append("captionPosition", "bottom");
              videoFormData.append("captionStyle", "word-by-word");
              videoFormData.append("fontSize", "10");

              const videoResponse = await videoGenFetch("/generate", {
                method: "POST",
                body: videoFormData,
                headers: env.VIDEO_GEN_API_TOKEN ? { token: env.VIDEO_GEN_API_TOKEN } : {},
                signal: AbortSignal.timeout(120_000)
              });

              if (videoResponse.ok) {
                const videoPayload = await videoResponse.json() as { success: boolean; url: string };
                if (videoPayload.success && videoPayload.url) {
                  finalImage = await prisma.routeImage.update({
                    where: { id: createdImage.id },
                    data: { videoUrl: videoPayload.url }
                  });
                }
              } else {
                console.warn(`[upload] Auto-video generation failed for ${file.originalname}: ${videoResponse.status}`);
              }
            } catch (videoErr) {
              console.warn(`[upload] Auto-video generation error for ${file.originalname}:`, videoErr);
            }
          }

          uploadedImages.push({ image: finalImage, assets: imageAssets });

          orderIndex += 1;
        } catch (error) {
          const reason = error instanceof Error ? error.message : "Unknown upload error";
          failedImages.push({
            filename: file.originalname,
            reason
          });
        }
      }

      const statusCode = failedImages.length === 0 ? 201 : uploadedImages.length > 0 ? 207 : 400;
      res.status(statusCode).json({
        added: uploadedImages.length,
        failed: failedImages.length,
        uploadedImages,
        failedImages
      });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.post("/routes/:routeId/generate", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);

    const points = routeSession.images
      .filter((image: any) => Number.isFinite(image.gpsLat) && Number.isFinite(image.gpsLng))
      .map((image: any) => ({
        lat: image.gpsLat as number,
        lng: image.gpsLng as number
      }));

    if (points.length < 2) {
      throw new HttpError(400, "At least two images with GPS data are required to generate a route");
    }

    const width = parseDimension(req.query.width, 1400);
    const height = parseDimension(req.query.height, 780);

    const oldRouteAssets = routeSession.assets.filter((asset: any) => asset.assetType === ASSET_TYPE.ROUTE_MAP);
    for (const oldAsset of oldRouteAssets) {
      await deleteStorageFile(oldAsset.storagePath);
    }

    if (oldRouteAssets.length > 0) {
      await prisma.routeAsset.deleteMany({
        where: {
          id: {
            in: oldRouteAssets.map((asset: any) => asset.id)
          }
        }
      });
    }

    const routeBuffer = await renderOrderedRouteMapPng({
      points,
      width,
      height
    });

    const storedRoute = await saveAssetFile({
      routeSessionId: routeSession.id,
      assetType: ASSET_TYPE.ROUTE_MAP,
      mimeType: "image/png",
      buffer: routeBuffer
    });

    const routeAsset = await prisma.routeAsset.create({
      data: {
        routeSessionId: routeSession.id,
        routeImageId: null,
        assetType: ASSET_TYPE.ROUTE_MAP,
        storagePath: storedRoute.relativePath,
        byteSize: storedRoute.byteSize,
        sha256: storedRoute.sha256
      }
    });

    await prisma.routeSession.update({
      where: { id: routeSession.id },
      data: {
        status: ROUTE_STATUS.COMPLETED,
        completedAt: new Date()
      }
    });

    res.status(200).json({
      routeAsset: {
        ...routeAsset,
        url: assetUrl(routeAsset.id)
      }
    });
  } catch (error) {
    next(error);
  }
});

userRouter.delete("/routes/:routeId/images/:imageId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const imageIdParam = req.params.imageId;
    const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

    if (!imageId) {
      throw new HttpError(400, "Image id is required");
    }

    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
    const image = routeSession.images.find((e: any) => e.id === imageId);

    if (!image) {
      throw new HttpError(404, "Image not found in route session");
    }

    const imageAssets = routeSession.assets.filter((a: any) => a.routeImageId === imageId);
    for (const asset of imageAssets) {
      await deleteStorageFile(asset.storagePath);
    }

    await prisma.routeImage.delete({ where: { id: imageId } });

    // Re-index remaining images to keep orderIndex contiguous
    const remaining = routeSession.images
      .filter((e: any) => e.id !== imageId)
      .sort((a: any, b: any) => a.orderIndex - b.orderIndex);
    for (let i = 0; i < remaining.length; i += 1) {
      if (remaining[i].orderIndex !== i) {
        await prisma.routeImage.update({
          where: { id: remaining[i].id },
          data: { orderIndex: i }
        });
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

userRouter.patch("/routes/:routeId/reorder", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const imageIds = req.body?.imageIds;

    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      throw new HttpError(400, "imageIds must be a non-empty array");
    }

    if (!imageIds.every((id: unknown) => typeof id === "string")) {
      throw new HttpError(400, "All imageIds must be strings");
    }

    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
    const sessionImageIds = new Set(routeSession.images.map((i: any) => i.id));

    for (const id of imageIds) {
      if (!sessionImageIds.has(id)) {
        throw new HttpError(400, `Image ${id} does not belong to this route session`);
      }
    }

    await Promise.all(
      imageIds.map((id: string, index: number) =>
        prisma.routeImage.update({ where: { id }, data: { orderIndex: index } })
      )
    );

    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

userRouter.patch("/routes/:routeId/images/:imageId/location", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const imageIdParam = req.params.imageId;
    const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

    if (!imageId) {
      throw new HttpError(400, "Image id is required");
    }

    const rawLat = req.body?.lat;
    const rawLng = req.body?.lng;
    const lat = typeof rawLat === "number" ? rawLat : parseFloat(rawLat);
    const lng = typeof rawLng === "number" ? rawLng : parseFloat(rawLng);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      throw new HttpError(400, "lat must be a valid latitude between -90 and 90");
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      throw new HttpError(400, "lng must be a valid longitude between -180 and 180");
    }

    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
    const image = routeSession.images.find((e: any) => e.id === imageId);

    if (!image) {
      throw new HttpError(404, "Image not found in route session");
    }

    const gps = { lat, lng };
    const locationInfo = await fetchLocationInfo(gps).catch(() => ({ gps, displayName: "Unknown location" }));

    const mapBuffer = await renderMapPng({ lat, lng, zoom: 13, width: 460, height: 280 });

    const oldMapAssets = routeSession.assets.filter(
      (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.IMAGE_MAP
    );
    for (const old of oldMapAssets) {
      await deleteStorageFile(old.storagePath);
    }
    if (oldMapAssets.length > 0) {
      await prisma.routeAsset.deleteMany({
        where: { id: { in: oldMapAssets.map((a: any) => a.id) } }
      });
    }

    const mapAssetFile = await saveAssetFile({
      routeSessionId: routeSession.id,
      assetType: ASSET_TYPE.IMAGE_MAP,
      mimeType: "image/png",
      buffer: mapBuffer
    });

    const mapAssetRow = await prisma.routeAsset.create({
      data: {
        routeSessionId: routeSession.id,
        routeImageId: imageId,
        assetType: ASSET_TYPE.IMAGE_MAP,
        storagePath: mapAssetFile.relativePath,
        byteSize: mapAssetFile.byteSize,
        sha256: mapAssetFile.sha256
      }
    });

    await prisma.routeImage.update({
      where: { id: imageId },
      data: {
        gpsLat: lat,
        gpsLng: lng,
        locationInfoJson: JSON.stringify(locationInfo)
      }
    });

    res.status(200).json({
      locationInfo,
      mapAsset: { ...mapAssetRow, url: assetUrl(mapAssetRow.id) }
    });
  } catch (error) {
    next(error);
  }
});

userRouter.patch("/routes/:routeId/images/:imageId/note", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const imageIdParam = req.params.imageId;
    const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

    if (!imageId) {
      throw new HttpError(400, "Image id is required");
    }

    const note = typeof req.body?.userNote === "string" ? req.body.userNote.trim() : "";
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
    const image = routeSession.images.find((entry: any) => entry.id === imageId);

    if (!image) {
      throw new HttpError(404, "Image not found in route session");
    }

    const updatedImage = await prisma.routeImage.update({
      where: { id: imageId },
      data: {
        userNote: note.length > 0 ? note : null
      },
      select: {
        id: true,
        userNote: true,
        routeSessionId: true
      }
    });

    res.status(200).json({ image: updatedImage });
  } catch (error) {
    next(error);
  }
});

userRouter.get("/routes/:routeId/route-map", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
    const routeAsset = routeSession.assets
      .filter((asset: any) => asset.assetType === ASSET_TYPE.ROUTE_MAP)
      .sort((a: any, b: any) => b.createdAt.getTime() - a.createdAt.getTime())[0];

    if (!routeAsset) {
      throw new HttpError(404, "No generated route map found");
    }

    const filePath = resolveStoragePath(routeAsset.storagePath);
    res.setHeader("Content-Type", "image/png");
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

userRouter.get("/assets/:assetId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const assetIdParam = req.params.assetId;
    const assetId = Array.isArray(assetIdParam) ? assetIdParam[0] : assetIdParam;

    if (!assetId) {
      throw new HttpError(400, "Asset id is required");
    }

    const asset = await prisma.routeAsset.findUnique({
      where: { id: assetId },
      include: {
        routeSession: {
          select: {
            userId: true
          }
        }
      }
    });

    if (!asset) {
      throw new HttpError(404, "Asset not found");
    }

    if (asset.routeSession.userId !== req.user!.id) {
      throw new HttpError(403, "Not allowed to access this asset");
    }

    const filePath = resolveStoragePath(asset.storagePath);
    const contentType =
      asset.assetType === ASSET_TYPE.ORIGINAL_IMAGE ? undefined
      : asset.assetType === ASSET_TYPE.VIDEO_THUMBNAIL ? "image/jpeg"
      : "image/png";
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
});

userRouter.post(
  "/routes/:routeId/images/:imageId/summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isClaudeAiConfigured) {
        throw new HttpError(503, "Claude AI is not configured");
      }

      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

      if (!imageId) {
        throw new HttpError(400, "Image id is required");
      }

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((entry: any) => entry.id === imageId);

      if (!image) {
        throw new HttpError(404, "Image not found in route session");
      }

      // Require at least a user note to generate a meaningful summary
      if (!image.userNote || !image.userNote.trim()) {
        throw new HttpError(400, "A user note is required to generate an AI summary. Add a note to this photo first.");
      }

      // Parse location info
      let locationInfo: any = null;
      if (image.locationInfoJson) {
        try {
          locationInfo = JSON.parse(image.locationInfoJson);
        } catch {
          // Invalid JSON, skip
        }
      }

      // Generate summary using Claude AI — use custom prompt from DB if set
      const promptSetting = await prisma.appSetting.findUnique({ where: { key: "caption_prompt" } });
      const summary = await generateImageSummary({
        userNote: image.userNote,
        locationInfo,
        originalFilename: image.originalFilename,
        imageAnalysis: (image as any).imageAnalysis ?? null
      }, promptSetting?.value ?? undefined);

      // Save summary to database
      const updatedImage = await prisma.routeImage.update({
        where: { id: imageId },
        data: {
          aiSummary: summary
        },
        select: {
          id: true,
          aiSummary: true,
          routeSessionId: true
        }
      });

      res.status(200).json({ image: updatedImage });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.patch(
  "/routes/:routeId/images/:imageId/summary",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

      if (!imageId) {
        throw new HttpError(400, "Image id is required");
      }

      const summary = typeof req.body?.aiSummary === "string" ? req.body.aiSummary.trim() : "";
      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((entry: any) => entry.id === imageId);

      if (!image) {
        throw new HttpError(404, "Image not found in route session");
      }

      const updatedImage = await prisma.routeImage.update({
        where: { id: imageId },
        data: {
          aiSummary: summary.length > 0 ? summary : null
        },
        select: {
          id: true,
          aiSummary: true,
          routeSessionId: true
        }
      });

      res.status(200).json({ image: updatedImage });
    } catch (error) {
      next(error);
    }
  }
);

const SUPPORTED_TRANSLATION_LANGUAGES: TranslationLanguage[] = ["german", "spanish", "bulgarian"];

userRouter.post(
  "/routes/:routeId/images/:imageId/translate",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isClaudeAiConfigured) {
        throw new HttpError(503, "Claude AI is not configured");
      }

      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

      if (!imageId) {
        throw new HttpError(400, "Image id is required");
      }

      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      const language = req.body?.language;

      if (!text) {
        throw new HttpError(400, "text is required");
      }

      if (!SUPPORTED_TRANSLATION_LANGUAGES.includes(language as TranslationLanguage)) {
        throw new HttpError(400, "language must be one of: german, spanish, bulgarian");
      }

      // Verify the image belongs to the authenticated user
      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((e: any) => e.id === imageId);
      if (!image) {
        throw new HttpError(404, "Image not found in route session");
      }

      const translation = await translateText(text, language as TranslationLanguage);
      res.status(200).json({ translation });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.patch("/routes/:routeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);

    if (typeof req.body?.title !== "string") {
      throw new HttpError(400, "title must be a string");
    }

    const title = req.body.title.trim();
    if (title.length < 2 || title.length > 120) {
      throw new HttpError(400, "title must be between 2 and 120 characters");
    }

    const updatedRoute = await prisma.routeSession.update({
      where: { id: routeSession.id },
      data: { title },
      select: {
        id: true,
        title: true,
        updatedAt: true
      }
    });

    res.status(200).json({ routeSession: updatedRoute });
  } catch (error) {
    next(error);
  }
});

userRouter.delete("/routes/:routeId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const routeId = normalizeRouteId(req);
    const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);

    for (const asset of routeSession.assets) {
      await deleteStorageFile(asset.storagePath);
    }

    await prisma.routeSession.delete({ where: { id: routeId } });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});

userRouter.post(
  "/routes/:routeId/images/:imageId/video",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isVideoGenConfigured) {
        throw new HttpError(503, "Video generation API is not configured (VIDEO_GEN_API_URL not set)");
      }

      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;

      if (!imageId) {
        throw new HttpError(400, "Image id is required");
      }

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((e: any) => e.id === imageId);

      if (!image) {
        throw new HttpError(404, "Image not found in route session");
      }

      if (!image.aiSummary || !image.aiSummary.trim()) {
        throw new HttpError(400, "An AI summary is required to generate a video. Generate a summary first.");
      }

      // Find the original image asset stored on disk
      const originalAsset = routeSession.assets.find(
        (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.ORIGINAL_IMAGE
      );

      if (!originalAsset) {
        throw new HttpError(404, "Original image file not found");
      }

      // Read image from local storage
      const imageBuffer = await fs.promises.readFile(resolveStoragePath(originalAsset.storagePath));

      // Build multipart form and call the external video-gen API
      console.log("[video] received body:", JSON.stringify(req.body));

      const rawEffect = typeof req.body?.effect === "string" ? req.body.effect.trim() : "none";
      const effect = VALID_VIDEO_EFFECTS.includes(rawEffect as any) ? rawEffect : "none";

      const VALID_CAPTION_POSITIONS = ["top", "center", "bottom"];
      const rawCaption = typeof req.body?.captionPosition === "string" ? req.body.captionPosition.trim() : "bottom";
      const captionPosition = VALID_CAPTION_POSITIONS.includes(rawCaption) ? rawCaption : "bottom";

      const VALID_CAPTION_STYLES = ["word-by-word", "karaoke"];
      const rawStyle = typeof req.body?.captionStyle === "string" ? req.body.captionStyle.trim() : "word-by-word";
      const captionStyle = VALID_CAPTION_STYLES.includes(rawStyle) ? rawStyle : "word-by-word";

      const rawFontSize = Number(req.body?.fontSize);
      const fontSize = Number.isInteger(rawFontSize) && rawFontSize >= 8 && rawFontSize <= 120 ? rawFontSize : null;

      console.log("[video] resolved params:", { effect, captionPosition, captionStyle, fontSize });

      const formData = new FormData();
      const blob = new Blob([imageBuffer], { type: image.mimeType || "image/jpeg" });
      formData.append("image", blob, image.originalFilename);
      formData.append("text", image.aiSummary.trim());
      formData.append("effect", effect);
      formData.append("captionPosition", captionPosition);
      formData.append("captionStyle", captionStyle);
      if (fontSize !== null) formData.append("fontSize", String(fontSize))
        else formData.append("fontSize", "10");

      const videoResponse = await videoGenFetch("/generate", {
        method: "POST",
        body: formData,
        headers: env.VIDEO_GEN_API_TOKEN ? { token: env.VIDEO_GEN_API_TOKEN } : {},
        signal: AbortSignal.timeout(120_000)
      });

      if (!videoResponse.ok) {
        const errBody = await videoResponse.json().catch(() => ({ error: "Video generation failed" }));
        throw new HttpError(502, (errBody as any).error || "Video generation failed");
      }

      const videoPayload = await videoResponse.json() as { success: boolean; url: string };

      if (!videoPayload.success || !videoPayload.url) {
        throw new HttpError(502, "Video API returned an unexpected response");
      }

      // Persist the video URL as metadata on the image
      const updatedImage = await prisma.routeImage.update({
        where: { id: imageId },
        data: { videoUrl: videoPayload.url },
        select: { id: true, videoUrl: true, routeSessionId: true }
      });

      res.status(200).json({ image: updatedImage });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.post(
  "/routes/:routeId/combine-video",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isVideoGenConfigured) {
        throw new HttpError(503, "Video generation API is not configured (VIDEO_GEN_API_URL not set)");
      }

      const routeId = normalizeRouteId(req);
      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);

      // Collect video URLs from images in their stored order
      const videoUrls: string[] = routeSession.images
        .filter((img: any) => img.videoUrl && img.videoUrl.trim())
        .map((img: any) => img.videoUrl.trim() as string);

      if (videoUrls.length < 2) {
        throw new HttpError(
          400,
          `At least 2 photos must have generated videos to combine (found ${videoUrls.length})`
        );
      }

      const transition: string = req.body?.transition || "none";
      const transitionDuration: number =
        typeof req.body?.transitionDuration === "number"
          ? req.body.transitionDuration
          : parseFloat(req.body?.transitionDuration) || 0.5;

      const combineResponse = await videoGenFetch("/combine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(env.VIDEO_GEN_API_TOKEN ? { token: env.VIDEO_GEN_API_TOKEN } : {})
        },
        body: JSON.stringify({ urls: videoUrls, transition, transitionDuration }),
        signal: AbortSignal.timeout(300_000)
      });

      if (!combineResponse.ok) {
        const errBody = await combineResponse.json().catch(() => ({ error: "Combine failed" }));
        throw new HttpError(502, (errBody as any).error || "Combine failed");
      }

      const combinePayload = await combineResponse.json() as {
        success: boolean;
        url: string;
        videoCount: number;
        duration: number;
      };

      if (!combinePayload.success || !combinePayload.url) {
        throw new HttpError(502, "Combine API returned an unexpected response");
      }

      // Persist the combined video URL on the route session
      await prisma.routeSession.update({
        where: { id: routeSession.id },
        data: { combinedVideoUrl: combinePayload.url }
      });

      res.status(200).json({
        combinedVideoUrl: combinePayload.url,
        videoCount: combinePayload.videoCount,
        duration: combinePayload.duration
      });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.get(
  "/routes/:routeId/images/:imageId/source-video",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;
      if (!imageId) throw new HttpError(400, "Image id is required");

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const videoAsset = routeSession.assets.find(
        (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.ORIGINAL_VIDEO
      );
      if (!videoAsset) throw new HttpError(404, "No source video found for this item");

      const filePath = resolveStoragePath(videoAsset.storagePath);
      const ext = path.extname(videoAsset.storagePath).toLowerCase();
      const mime = ext === ".mov" ? "video/quicktime"
        : ext === ".webm" ? "video/webm"
        : ext === ".avi" ? "video/x-msvideo"
        : "video/mp4";
      res.setHeader("Content-Type", mime);
      res.sendFile(filePath);
    } catch (error) {
      next(error);
    }
  }
);


userRouter.post(
  "/routes/:routeId/images/:imageId/source-video",
  videoUpload.single("video"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new HttpError(400, "Missing field: video");

      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;
      if (!imageId) throw new HttpError(400, "Image id is required");

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((e: any) => e.id === imageId);
      if (!image) throw new HttpError(404, "Image not found in route session");

      // Remove any existing source video asset
      const existing = routeSession.assets.find(
        (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.ORIGINAL_VIDEO
      );
      if (existing) {
        await deleteStorageFile(existing.storagePath);
        await prisma.routeAsset.delete({ where: { id: existing.id } });
      }

      const { relativePath, byteSize, sha256 } = await saveAssetFile({
        routeSessionId: routeSession.id,
        assetType: ASSET_TYPE.ORIGINAL_VIDEO,
        mimeType: req.file.mimetype,
        buffer: req.file.buffer
      });

      await prisma.routeAsset.create({
        data: {
          routeSessionId: routeSession.id,
          routeImageId: imageId,
          assetType: ASSET_TYPE.ORIGINAL_VIDEO,
          storagePath: relativePath,
          byteSize,
          sha256
        }
      });

      // Generate and store a thumbnail from the video
      let thumbnailAssetId: string | null = null;
      const thumbBuffer = await extractVideoThumbnail(req.file.buffer, req.file.mimetype);
      if (thumbBuffer) {
        // Remove any existing thumbnail for this image
        const existingThumb = routeSession.assets.find(
          (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.VIDEO_THUMBNAIL
        );
        if (existingThumb) {
          await deleteStorageFile(existingThumb.storagePath);
          await prisma.routeAsset.delete({ where: { id: existingThumb.id } });
        }
        const { relativePath: thumbPath, byteSize: thumbSize, sha256: thumbHash } = await saveAssetFile({
          routeSessionId: routeSession.id,
          assetType: ASSET_TYPE.VIDEO_THUMBNAIL,
          mimeType: "image/jpeg",
          buffer: thumbBuffer
        });
        const thumbAsset = await prisma.routeAsset.create({
          data: {
            routeSessionId: routeSession.id,
            routeImageId: imageId,
            assetType: ASSET_TYPE.VIDEO_THUMBNAIL,
            storagePath: thumbPath,
            byteSize: thumbSize,
            sha256: thumbHash
          }
        });
        thumbnailAssetId = thumbAsset.id;
      }

      const updatedImage = await prisma.routeImage.update({
        where: { id: imageId },
        data: { hasSourceVideo: true },
        select: { id: true, hasSourceVideo: true, routeSessionId: true }
      });

      const thumbnailUrl = thumbnailAssetId ? `/api/user/assets/${thumbnailAssetId}` : null;
      res.status(200).json({ image: updatedImage, thumbnailUrl });
    } catch (error) {
      next(error);
    }
  }
);

userRouter.post(
  "/routes/:routeId/images/:imageId/video-from-video",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isVideoGenConfigured) {
        throw new HttpError(503, "Video generation API is not configured (VIDEO_GEN_API_URL not set)");
      }

      const routeId = normalizeRouteId(req);
      const imageIdParam = req.params.imageId;
      const imageId = Array.isArray(imageIdParam) ? imageIdParam[0] : imageIdParam;
      if (!imageId) throw new HttpError(400, "Image id is required");

      const routeSession = await loadOwnedRouteSession(req.user!.id, routeId);
      const image = routeSession.images.find((e: any) => e.id === imageId);
      if (!image) throw new HttpError(404, "Image not found in route session");

      if (!image.aiSummary || !image.aiSummary.trim()) {
        throw new HttpError(400, "An AI summary is required to generate a video. Generate a summary first.");
      }

      const videoAsset = routeSession.assets.find(
        (a: any) => a.routeImageId === imageId && a.assetType === ASSET_TYPE.ORIGINAL_VIDEO
      );
      if (!videoAsset) {
        throw new HttpError(400, "No source video uploaded for this photo. Upload a video first.");
      }

      const videoBuffer = await fs.promises.readFile(resolveStoragePath(videoAsset.storagePath));
      const ext = path.extname(videoAsset.storagePath).toLowerCase();
      const videoMime = ext === ".mov" ? "video/quicktime"
        : ext === ".webm" ? "video/webm"
        : ext === ".avi" ? "video/x-msvideo"
        : "video/mp4";

      const formData = new FormData();
      const blob = new Blob([videoBuffer], { type: videoMime });
      formData.append("video", blob, `source${ext || ".mp4"}`);
      formData.append("text", image.aiSummary.trim());

      console.log("[video-from-video] received body:", JSON.stringify(req.body));
      const rawEffectV = typeof req.body?.effect === "string" ? req.body.effect.trim() : "none";
      formData.append("effect", VALID_VIDEO_EFFECTS.includes(rawEffectV as any) ? rawEffectV : "none");

      const VALID_POSITIONS_V = ["top", "center", "bottom"];
      const rawPositionV = typeof req.body?.captionPosition === "string" ? req.body.captionPosition.trim() : "bottom";
      formData.append("captionPosition", VALID_POSITIONS_V.includes(rawPositionV) ? rawPositionV : "bottom");

      const VALID_STYLES_V = ["word-by-word", "karaoke"];
      const rawStyleV = typeof req.body?.captionStyle === "string" ? req.body.captionStyle.trim() : "word-by-word";
      formData.append("captionStyle", VALID_STYLES_V.includes(rawStyleV) ? rawStyleV : "word-by-word");

      const rawFontSizeV = Number(req.body?.fontSize);
      const fontSizeV = Number.isInteger(rawFontSizeV) && rawFontSizeV >= 8 && rawFontSizeV <= 120 ? rawFontSizeV : null;
      if (fontSizeV !== null) formData.append("fontSize", String(fontSizeV));

      const videoResponse = await videoGenFetch("/generate-video", {
        method: "POST",
        body: formData,
        headers: env.VIDEO_GEN_API_TOKEN ? { token: env.VIDEO_GEN_API_TOKEN } : {},
        signal: AbortSignal.timeout(300_000)
      });

      if (!videoResponse.ok) {
        const errBody = await videoResponse.json().catch(() => ({ error: "Video generation failed" }));
        throw new HttpError(502, (errBody as any).error || "Video generation from video failed");
      }

      const videoPayload = await videoResponse.json() as { success: boolean; url: string };
      if (!videoPayload.success || !videoPayload.url) {
        throw new HttpError(502, "Video API returned an unexpected response");
      }

      const updatedImage = await prisma.routeImage.update({
        where: { id: imageId },
        data: { videoUrl: videoPayload.url },
        select: { id: true, videoUrl: true, routeSessionId: true }
      });

      res.status(200).json({ image: updatedImage });
    } catch (error) {
      next(error);
    }
  }
);

export { userRouter };
