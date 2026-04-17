import { createHash, randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const storageRoot = path.join(process.cwd(), "storage");

function extensionFromMime(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "video/x-msvideo") return ".avi";
  return ".bin";
}

function sanitizeSegment(input: string): string {
  return input.replace(/[^a-zA-Z0-9-_]/g, "_");
}

export interface StoredAssetResult {
  relativePath: string;
  absolutePath: string;
  byteSize: number;
  sha256: string;
}

export async function ensureStorageRoot(): Promise<void> {
  await fs.mkdir(storageRoot, { recursive: true });
}

export async function saveAssetFile(params: {
  routeSessionId: string;
  assetType: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredAssetResult> {
  await ensureStorageRoot();

  const routeFolder = sanitizeSegment(params.routeSessionId);
  const dir = path.join(storageRoot, routeFolder);
  await fs.mkdir(dir, { recursive: true });

  const ext = extensionFromMime(params.mimeType);
  const fileName = `${sanitizeSegment(params.assetType.toLowerCase())}-${Date.now()}-${randomUUID()}${ext}`;
  const absolutePath = path.join(dir, fileName);

  await fs.writeFile(absolutePath, params.buffer);

  const hash = createHash("sha256").update(params.buffer).digest("hex");
  const relativePath = path.relative(storageRoot, absolutePath).split(path.sep).join("/");

  return {
    relativePath,
    absolutePath,
    byteSize: params.buffer.byteLength,
    sha256: hash
  };
}

export function resolveStoragePath(relativePath: string): string {
  const normalized = relativePath.split("/").join(path.sep);
  const absolute = path.resolve(storageRoot, normalized);
  const root = path.resolve(storageRoot);

  if (!absolute.startsWith(root)) {
    throw new Error("Invalid storage path");
  }

  return absolute;
}

export async function deleteStorageFile(relativePath: string): Promise<void> {
  try {
    const absolute = resolveStoragePath(relativePath);
    await fs.unlink(absolute);
  } catch {
    // Ignore missing files during cleanup.
  }
}
