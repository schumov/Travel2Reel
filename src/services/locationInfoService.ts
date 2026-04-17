import { GpsCoordinates } from "./exifService";

export interface LocationInfoResult {
  gps: GpsCoordinates;
  displayName: string;
  city?: string;
  country?: string;
  wikiTitle?: string;
  wikiExtract?: string;
  wikiUrl?: string;
}

interface ReverseGeocodeResponse {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
  };
}

interface WikiGeosearchResponse {
  query?: {
    geosearch?: Array<{
      title: string;
      pageid: number;
      dist: number;
    }>;
  };
}

interface WikiSummaryResponse {
  title?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
}

async function reverseGeocode(gps: GpsCoordinates): Promise<ReverseGeocodeResponse> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", `${gps.lat}`);
  url.searchParams.set("lon", `${gps.lng}`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "16");
  url.searchParams.set("addressdetails", "1");

  const response = await fetch(url, {
    headers: {
      "User-Agent": "GeoStoryboard/1.0 (local-dev)",
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return {};
  }

  return (await response.json()) as ReverseGeocodeResponse;
}

async function getNearestWikiTitle(gps: GpsCoordinates): Promise<string | undefined> {
  const url = new URL("https://en.wikipedia.org/w/api.php");
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "geosearch");
  url.searchParams.set("gscoord", `${gps.lat}|${gps.lng}`);
  url.searchParams.set("gsradius", "10000");
  url.searchParams.set("gslimit", "1");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return undefined;
  }

  const payload = (await response.json()) as WikiGeosearchResponse;
  return payload.query?.geosearch?.[0]?.title;
}

async function getWikiSummary(title: string): Promise<WikiSummaryResponse | undefined> {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    return undefined;
  }

  return (await response.json()) as WikiSummaryResponse;
}

export async function fetchLocationInfo(gps: GpsCoordinates): Promise<LocationInfoResult> {
  const reverse = await reverseGeocode(gps);
  const city =
    reverse.address?.city ||
    reverse.address?.town ||
    reverse.address?.village ||
    reverse.address?.municipality ||
    reverse.address?.county ||
    reverse.address?.state;

  const result: LocationInfoResult = {
    gps,
    displayName: reverse.display_name || "Unknown location",
    city,
    country: reverse.address?.country
  };

  const wikiTitle = await getNearestWikiTitle(gps);
  if (!wikiTitle) {
    return result;
  }

  const wiki = await getWikiSummary(wikiTitle);
  if (!wiki) {
    return result;
  }

  result.wikiTitle = wiki.title;
  result.wikiExtract = wiki.extract;
  result.wikiUrl = wiki.content_urls?.desktop?.page;
  return result;
}
