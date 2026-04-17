import * as exifr from "exifr";
import { HttpError } from "../utils/validators";

export interface GpsCoordinates {
  lat: number;
  lng: number;
}

export async function extractGpsCoordinates(imageBuffer: Buffer): Promise<GpsCoordinates> {
  const coords = await tryExtractGpsCoordinates(imageBuffer);
  if (!coords) {
    if (!imageBuffer || imageBuffer.length === 0) {
      throw new HttpError(400, "Request body must contain a binary image");
    }
    throw new HttpError(400, "Image does not contain GPS EXIF coordinates");
  }
  return coords;
}

export async function tryExtractGpsCoordinates(imageBuffer: Buffer): Promise<GpsCoordinates | null> {
  if (!imageBuffer || imageBuffer.length === 0) return null;
  try {
    const gps = await exifr.gps(imageBuffer);
    const lat = gps?.latitude;
    const lng = gps?.longitude;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const normalizedLat = lat as number;
    const normalizedLng = lng as number;
    if (normalizedLat < -90 || normalizedLat > 90) return null;
    if (normalizedLng < -180 || normalizedLng > 180) return null;
    return { lat: normalizedLat, lng: normalizedLng };
  } catch {
    return null;
  }
}
