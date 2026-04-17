import puppeteer, { Browser } from "puppeteer";
import {
  buildMapHtml,
  buildOrderedRouteMapHtml,
  buildRouteMapHtml
} from "./mapTemplate";
import { RenderMapParams } from "../utils/validators";
import { env } from "../config/env";

export interface RenderRouteParams {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  width: number;
  height: number;
}

export interface RenderOrderedRouteParams {
  points: Array<{
    lat: number;
    lng: number;
  }>;
  width: number;
  height: number;
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });
  }

  return browserPromise;
}

async function preparePageForOsmRequests(page: Awaited<ReturnType<Browser["newPage"]>>): Promise<void> {
  await page.setUserAgent(env.OSM_USER_AGENT);
  await page.setExtraHTTPHeaders({
    referer: env.OSM_REFERER
  });

  // Ensure OSM tile requests always carry explicit identity headers.
  // setExtraHTTPHeaders alone may be ignored/overwritten for some subresource requests.
  await page.setRequestInterception(true);
  page.on("request", (request) => {
    const url = request.url();
    const isOsmTile = /(^|\.)tile\.openstreetmap\.org\//i.test(url);

    if (!isOsmTile) {
      void request.continue();
      return;
    }

    const headers = {
      ...request.headers(),
      referer: env.OSM_REFERER,
      "user-agent": env.OSM_USER_AGENT
    };

    void request.continue({ headers });
  });
}

export async function renderMapPng(params: RenderMapParams): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await preparePageForOsmRequests(page);
    await page.setViewport({
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1
    });

    const html = buildMapHtml(params);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => (window as any).__MAP_READY__ === true, {
      timeout: 10_000
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    const data = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: params.width,
        height: params.height
      }
    });

    return Buffer.from(data);
  } finally {
    await page.close();
  }
}

export async function renderRouteMapPng(params: RenderRouteParams): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await preparePageForOsmRequests(page);
    await page.setViewport({
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1
    });

    const html = buildRouteMapHtml(params);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => (window as any).__MAP_READY__ === true, {
      timeout: 10_000
    });

    await new Promise((resolve) => setTimeout(resolve, 120));

    const data = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: params.width,
        height: params.height
      }
    });

    return Buffer.from(data);
  } finally {
    await page.close();
  }
}

export async function renderOrderedRouteMapPng(
  params: RenderOrderedRouteParams
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await preparePageForOsmRequests(page);
    await page.setViewport({
      width: params.width,
      height: params.height,
      deviceScaleFactor: 1
    });

    const html = buildOrderedRouteMapHtml(params);
    await page.setContent(html, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(() => (window as any).__MAP_READY__ === true, {
      timeout: 10_000
    });

    await new Promise((resolve) => setTimeout(resolve, 140));

    const data = await page.screenshot({
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: params.width,
        height: params.height
      }
    });

    return Buffer.from(data);
  } finally {
    await page.close();
  }
}

export async function closeMapRenderer(): Promise<void> {
  if (!browserPromise) {
    return;
  }

  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
}
