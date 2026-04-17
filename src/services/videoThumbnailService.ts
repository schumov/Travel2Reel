import ffmpegPath from "ffmpeg-static";
import Ffmpeg from "fluent-ffmpeg";
import * as os from "os";
import * as fs from "fs";
import * as path from "path";

if (ffmpegPath) {
  Ffmpeg.setFfmpegPath(ffmpegPath);
}

/**
 * Extracts a JPEG thumbnail from a video buffer at ~1 second.
 * Returns a JPEG Buffer, or null if extraction fails.
 */
export async function extractVideoThumbnail(videoBuffer: Buffer, mimeType: string): Promise<Buffer | null> {
  const ext = mimeType === "video/quicktime" ? ".mov"
    : mimeType === "video/webm" ? ".webm"
    : mimeType === "video/x-msvideo" ? ".avi"
    : ".mp4";

  const tmpDir = os.tmpdir();
  const inputPath  = path.join(tmpDir, `vthumb-in-${Date.now()}${ext}`);
  const outputPath = path.join(tmpDir, `vthumb-out-${Date.now()}.jpg`);

  try {
    await fs.promises.writeFile(inputPath, videoBuffer);

    await new Promise<void>((resolve, reject) => {
      Ffmpeg(inputPath)
        .seekInput(1)          // seek to 1 second (fallback to 0 if shorter)
        .outputOptions(["-vframes", "1", "-q:v", "3"])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => {
          // If seek past EOF, retry at 0
          Ffmpeg(inputPath)
            .seekInput(0)
            .outputOptions(["-vframes", "1", "-q:v", "3"])
            .output(outputPath)
            .on("end", () => resolve())
            .on("error", reject)
            .run();
        })
        .run();
    });

    const thumbnail = await fs.promises.readFile(outputPath);
    return thumbnail;
  } catch (err) {
    console.warn("[videoThumbnail] Failed to extract thumbnail:", err);
    return null;
  } finally {
    await fs.promises.unlink(inputPath).catch(() => {});
    await fs.promises.unlink(outputPath).catch(() => {});
  }
}
