export const DEFAULT_IMAGE_ANALYSIS_URL =
  "https://n8n.shumov.eu/webhook/c40d6667-6dab-4809-b4e0-91efca514a01";

const ANALYSIS_TIMEOUT_MS = 30_000;

/**
 * Post an image buffer to the configured analysis API and return the plain-text result.
 * Returns null if the API is not configured, unreachable, or times out.
 */
export async function analyzeImage(
  buffer: Buffer,
  mimeType: string,
  apiUrl: string
): Promise<string | null> {
  if (!apiUrl || !apiUrl.trim()) return null;

  const formData = new FormData();
  const typedArray = new Uint8Array(buffer.buffer as ArrayBuffer, buffer.byteOffset, buffer.byteLength);
  const blob = new Blob([typedArray], { type: mimeType });
  formData.append("image", blob, "image");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  try {
    const response = await fetch(apiUrl.trim(), {
      method: "POST",
      body: formData,
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`[imageAnalysis] API responded with ${response.status}`);
      return null;
    }

    const text = (await response.text()).trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn(`[imageAnalysis] Request failed: ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
