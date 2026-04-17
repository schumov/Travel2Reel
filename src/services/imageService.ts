import sharp from "sharp";
import { env } from "../config/env";

export interface ProcessedImage {
  buffer: Buffer;
  format: string;
  width: number;
  height: number;
  size: number;
}

/**
 * Process an image with auto-rotation, compression, and EXIF stripping
 * @param inputBuffer - Raw image buffer (JPEG, PNG, etc.)
 * @returns Processed image buffer, format, dimensions, and size
 */
export async function processImage(inputBuffer: Buffer): Promise<ProcessedImage> {
  try {
    // Start with Sharp pipeline
    let pipeline = sharp(inputBuffer);

    // Get metadata to check for orientation
    const metadata = await pipeline.metadata();

    // Auto-rotate based on EXIF orientation
    if (env.IMAGE_AUTO_ROTATE && metadata.orientation) {
      pipeline = pipeline.rotate();
    }

    // Determine max dimensions (maintain aspect ratio)
    const maxDimension = 1920;
    if (metadata.width && metadata.height) {
      const scale = Math.min(1, maxDimension / Math.max(metadata.width, metadata.height));
      if (scale < 1) {
        const newWidth = Math.round(metadata.width * scale);
        const newHeight = Math.round(metadata.height * scale);
        pipeline = pipeline.resize(newWidth, newHeight, {
          fit: "inside",
          withoutEnlargement: true
        });
      }
    }

    // Determine output format (prefer JPEG for compression)
    const format = metadata.format === "png" && !metadata.hasAlpha ? "jpeg" : metadata.format || "jpeg";

    // Apply compression based on format
    if (format === "jpeg") {
      pipeline = pipeline.jpeg({
        quality: env.IMAGE_COMPRESSION_QUALITY,
        progressive: true,
        mozjpeg: true // Better compression
      });
    } else if (format === "png") {
      pipeline = pipeline.png({
        compressionLevel: 9,
        adaptiveFiltering: true
      });
    } else if (format === "webp") {
      pipeline = pipeline.webp({
        quality: env.IMAGE_COMPRESSION_QUALITY
      });
    }

    // Strip EXIF and all metadata
    if (env.IMAGE_STRIP_EXIF) {
      // Use rotate with automatic orientation to strip EXIF after rotation
      // The pipeline transformation should have already reset metadata
    }

    // Convert to buffer
    const processedBuffer = await pipeline.toBuffer({ resolveWithObject: false });

    // Get final metadata
    const finalMetadata = await sharp(processedBuffer).metadata();

    // Check size constraint
    const maxSizeBytes = env.IMAGE_MAX_SIZE_MB * 1024 * 1024;
    if (processedBuffer.length > maxSizeBytes) {
      throw new Error(
        `Processed image exceeds max size: ${(processedBuffer.length / 1024 / 1024).toFixed(2)}MB > ${env.IMAGE_MAX_SIZE_MB}MB`
      );
    }

    return {
      buffer: processedBuffer,
      format: format || "jpeg",
      width: finalMetadata.width || 0,
      height: finalMetadata.height || 0,
      size: processedBuffer.length
    };
  } catch (error) {
    console.error("Image processing error:", error);
    throw new Error(
      `Image processing failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Generate a thumbnail from an image
 * @param inputBuffer - Raw image buffer
 * @param width - Thumbnail width (default 200)
 * @param height - Thumbnail height (default 200)
 * @returns Thumbnail buffer
 */
export async function generateThumbnail(
  inputBuffer: Buffer,
  width: number = 200,
  height: number = 200
): Promise<Buffer> {
  try {
    const thumbnail = await sharp(inputBuffer)
      .resize(width, height, {
        fit: "cover",
        position: "center"
      })
      .rotate() // Auto-rotate based on EXIF
      .jpeg({ quality: 60, progressive: true })
      .toBuffer();

    return thumbnail;
  } catch (error) {
    console.error("Thumbnail generation error:", error);
    throw new Error(
      `Thumbnail generation failed: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Get image dimensions without full processing
 * @param inputBuffer - Raw image buffer
 * @returns Width and height
 */
export async function getImageDimensions(
  inputBuffer: Buffer
): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(inputBuffer).metadata();
    return {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
  } catch (error) {
    console.error("Dimension extraction error:", error);
    throw new Error("Could not determine image dimensions");
  }
}
