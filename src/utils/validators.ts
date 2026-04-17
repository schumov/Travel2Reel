import { ParsedQs } from "qs";

export interface RenderMapParams {
  lat: number;
  lng: number;
  zoom: number;
  width: number;
  height: number;
}

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const DEFAULT_ZOOM = 13;
const DEFAULT_WIDTH = 800;
const DEFAULT_HEIGHT = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 19;
const MIN_SIZE = 256;
const MAX_SIZE = 2000;

function queryValueToString(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0];
  }

  return undefined;
}

function parseRequiredNumber(name: string, value: unknown): number {
  const raw = queryValueToString(value);
  if (raw === undefined) {
    throw new HttpError(400, `Missing required query parameter: ${name}`);
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `Invalid number for query parameter: ${name}`);
  }

  return parsed;
}

function parseOptionalNumber(value: unknown, fallback: number): number {
  const raw = queryValueToString(value);
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, "Invalid optional query parameter value");
  }

  return parsed;
}

export function validateRenderMapQuery(query: ParsedQs): RenderMapParams {
  const lat = parseRequiredNumber("lat", query.lat);
  const lng = parseRequiredNumber("lng", query.lng);
  const zoom = parseOptionalNumber(query.zoom, DEFAULT_ZOOM);
  const width = parseOptionalNumber(query.width, DEFAULT_WIDTH);
  const height = parseOptionalNumber(query.height, DEFAULT_HEIGHT);

  if (lat < -90 || lat > 90) {
    throw new HttpError(400, "lat must be between -90 and 90");
  }

  if (lng < -180 || lng > 180) {
    throw new HttpError(400, "lng must be between -180 and 180");
  }

  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
    throw new HttpError(400, `zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}`);
  }

  if (!Number.isInteger(width) || width < MIN_SIZE || width > MAX_SIZE) {
    throw new HttpError(400, `width must be an integer between ${MIN_SIZE} and ${MAX_SIZE}`);
  }

  if (!Number.isInteger(height) || height < MIN_SIZE || height > MAX_SIZE) {
    throw new HttpError(400, `height must be an integer between ${MIN_SIZE} and ${MAX_SIZE}`);
  }

  return { lat, lng, zoom, width, height };
}
