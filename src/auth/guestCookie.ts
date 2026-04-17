import crypto from "crypto";
import { env } from "../config/env";

export const GUEST_COOKIE_NAME = "guest_key";

function createSignature(guestKey: string): string {
  return crypto.createHmac("sha256", env.GUEST_COOKIE_SECRET).update(guestKey).digest("hex");
}

export function signGuestCookie(guestKey: string): string {
  const signature = createSignature(guestKey);
  return `${guestKey}.${signature}`;
}

export function verifyGuestCookie(value: string | undefined): string | null {
  if (!value) {
    return null;
  }

  const dotIndex = value.lastIndexOf(".");
  if (dotIndex <= 0) {
    return null;
  }

  const guestKey = value.slice(0, dotIndex);
  const providedSignature = value.slice(dotIndex + 1);
  const expectedSignature = createSignature(guestKey);

  const provided = Buffer.from(providedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");

  if (provided.length !== expected.length) {
    return null;
  }

  if (!crypto.timingSafeEqual(provided, expected)) {
    return null;
  }

  return guestKey;
}

export function parseCookie(header: string | undefined, key: string): string | undefined {
  if (!header) {
    return undefined;
  }

  const parts = header.split(";");
  for (const part of parts) {
    const [cookieKey, ...rest] = part.trim().split("=");
    if (cookieKey === key) {
      return decodeURIComponent(rest.join("="));
    }
  }

  return undefined;
}
