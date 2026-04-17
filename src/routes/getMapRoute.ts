import express, { Router, Request, Response, NextFunction } from "express";
import multer from "multer";
import { extractGpsCoordinates, tryExtractGpsCoordinates } from "../services/exifService";
import {
  renderMapPng,
  renderOrderedRouteMapPng,
  renderRouteMapPng
} from "../services/mapRenderService";
import { fetchLocationInfo } from "../services/locationInfoService";
import { HttpError } from "../utils/validators";

const getMapRouter = Router();
const binaryImageBodyParser = express.raw({
  type: () => true,
  limit: "15mb"
});
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 2
  }
});
const uploadMany = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
    files: 100
  }
});

function parseOptionalInteger(value: unknown, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }

  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new HttpError(400, "zoom, width and height must be integers");
  }

  return parsed;
}

getMapRouter.post(
  "/getmap",
  binaryImageBodyParser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        throw new HttpError(400, "Body must be binary image data");
      }

      const gps = await extractGpsCoordinates(req.body);

      const zoom = parseOptionalInteger(req.query.zoom, 13);
      const width = parseOptionalInteger(req.query.width, 800);
      const height = parseOptionalInteger(req.query.height, 600);

      if (zoom < 1 || zoom > 19) {
        throw new HttpError(400, "zoom must be between 1 and 19");
      }

      if (width < 256 || width > 2000) {
        throw new HttpError(400, "width must be between 256 and 2000");
      }

      if (height < 256 || height > 2000) {
        throw new HttpError(400, "height must be between 256 and 2000");
      }

      const png = await renderMapPng({
        lat: gps.lat,
        lng: gps.lng,
        zoom,
        width,
        height
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Map-Center", `${gps.lat},${gps.lng}`);
      res.setHeader("X-Map-Zoom", `${zoom}`);
      res.status(200).send(png);
    } catch (error) {
      next(error);
    }
  }
);

getMapRouter.post(
  "/getinfo",
  binaryImageBodyParser,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!Buffer.isBuffer(req.body)) {
        throw new HttpError(400, "Body must be binary image data");
      }

      const gps = await extractGpsCoordinates(req.body);
      const info = await fetchLocationInfo(gps);

      res.status(200).json(info);
    } catch (error) {
      next(error);
    }
  }
);

getMapRouter.post(
  "/getroute",
  upload.fields([
    { name: "startImage", maxCount: 1 },
    { name: "endImage", maxCount: 1 }
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as
        | {
            [fieldname: string]: Express.Multer.File[];
          }
        | undefined;

      const startImage = files?.startImage?.[0];
      const endImage = files?.endImage?.[0];

      if (!startImage || !endImage) {
        throw new HttpError(400, "Both startImage and endImage files are required");
      }

      const startGps = await extractGpsCoordinates(startImage.buffer);
      const endGps = await extractGpsCoordinates(endImage.buffer);

      const width = parseOptionalInteger(req.query.width, 1000);
      const height = parseOptionalInteger(req.query.height, 700);

      if (width < 256 || width > 2000) {
        throw new HttpError(400, "width must be between 256 and 2000");
      }

      if (height < 256 || height > 2000) {
        throw new HttpError(400, "height must be between 256 and 2000");
      }

      const routePng = await renderRouteMapPng({
        startLat: startGps.lat,
        startLng: startGps.lng,
        endLat: endGps.lat,
        endLng: endGps.lng,
        width,
        height
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Route-Start", `${startGps.lat},${startGps.lng}`);
      res.setHeader("X-Route-End", `${endGps.lat},${endGps.lng}`);
      res.setHeader("X-Map-Width", `${width}`);
      res.setHeader("X-Map-Height", `${height}`);
      res.status(200).send(routePng);
    } catch (error) {
      next(error);
    }
  }
);

getMapRouter.post(
  "/getroute-set",
  uploadMany.array("images", 100),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const images = req.files as Express.Multer.File[] | undefined;

      if (!images || images.length < 2) {
        throw new HttpError(400, "At least two files are required in the images field");
      }

      const width = parseOptionalInteger(req.query.width, 1200);
      const height = parseOptionalInteger(req.query.height, 700);

      if (width < 256 || width > 2000) {
        throw new HttpError(400, "width must be between 256 and 2000");
      }

      if (height < 256 || height > 2000) {
        throw new HttpError(400, "height must be between 256 and 2000");
      }

      const points: Array<{ lat: number; lng: number }> = [];

      for (let index = 0; index < images.length; index += 1) {
        const file = images[index];
        const gps = await tryExtractGpsCoordinates(file.buffer);
        if (gps) {
          points.push({ lat: gps.lat, lng: gps.lng });
        }
      }

      if (points.length < 2) {
        throw new HttpError(400, "At least two images with valid GPS EXIF data are required");
      }

      const routePng = await renderOrderedRouteMapPng({
        points,
        width,
        height
      });

      res.setHeader("Content-Type", "image/png");
      res.setHeader("X-Route-Points", `${points.length}`);
      res.setHeader("X-Map-Width", `${width}`);
      res.setHeader("X-Map-Height", `${height}`);
      res.status(200).send(routePng);
    } catch (error) {
      next(error);
    }
  }
);

export { getMapRouter };
