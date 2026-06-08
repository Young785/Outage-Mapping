import { Loader } from "@googlemaps/js-api-loader";

const LIBRARIES = ["marker", "geocoding"] as const;

let loadPromise: Promise<typeof google> | null = null;

/** Load Google Maps JS once with all libraries used by the app. */
export async function loadGoogleMaps(): Promise<typeof google> {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
  }

  if (typeof window !== "undefined" && window.google?.maps) {
    return window.google;
  }

  if (!loadPromise) {
    const loader = new Loader({
      apiKey: key,
      version: "weekly",
      libraries: [...LIBRARIES],
    });
    loadPromise = loader.load().then(() => window.google);
  }

  return loadPromise;
}

export function triggerMapResize(map: google.maps.Map | null | undefined) {
  if (!map || typeof google === "undefined") return;
  google.maps.event.trigger(map, "resize");
}
