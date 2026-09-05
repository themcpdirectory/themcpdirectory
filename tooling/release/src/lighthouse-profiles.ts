import { SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE } from "@themcpdirectory/test-utils";

export const PUBLIC_LIGHTHOUSE_ROUTE_MATRIX = [
  "/",
  "/search?q=github",
  "/github",
  "/docs",
  "/docs/api",
  "/docs/cli",
  "/docs/trust",
  "/docs/publishers",
  "/security",
  "/sign-in",
] as const;

export const AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX = [
  "/dashboard",
  SEEDED_PUBLISHER_LISTING_DETAIL_ROUTE,
] as const;

export const NOINDEX_LIGHTHOUSE_ROUTES: ReadonlySet<string> = new Set([
  "/search?q=github",
  ...AUTHENTICATED_LIGHTHOUSE_ROUTE_MATRIX,
]);

interface LighthouseProfile {
  readonly name: "mobile" | "desktop";
  readonly formFactor: "mobile" | "desktop";
  readonly screenEmulation: {
    readonly mobile: boolean;
    readonly width: number;
    readonly height: number;
    readonly deviceScaleFactor: number;
    readonly disabled: false;
  };
  readonly throttling: {
    readonly rttMs: number;
    readonly throughputKbps: number;
    readonly requestLatencyMs: number;
    readonly downloadThroughputKbps: number;
    readonly uploadThroughputKbps: number;
    readonly cpuSlowdownMultiplier: number;
  };
}

export const LIGHTHOUSE_MOBILE_PROFILE: LighthouseProfile = {
  name: "mobile",
  formFactor: "mobile",
  screenEmulation: {
    mobile: true,
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    disabled: false,
  },
  throttling: {
    rttMs: 150,
    throughputKbps: 1_638.4,
    requestLatencyMs: 562.5,
    downloadThroughputKbps: 1_474.56,
    uploadThroughputKbps: 675,
    cpuSlowdownMultiplier: 4,
  },
};

export const LIGHTHOUSE_DESKTOP_PROFILE: LighthouseProfile = {
  name: "desktop",
  formFactor: "desktop",
  screenEmulation: {
    mobile: false,
    width: 1_350,
    height: 940,
    deviceScaleFactor: 1,
    disabled: false,
  },
  throttling: {
    rttMs: 40,
    throughputKbps: 10_240,
    requestLatencyMs: 0,
    downloadThroughputKbps: 0,
    uploadThroughputKbps: 0,
    cpuSlowdownMultiplier: 1,
  },
};

export const LIGHTHOUSE_PROFILES = [
  LIGHTHOUSE_MOBILE_PROFILE,
  LIGHTHOUSE_DESKTOP_PROFILE,
] as const;