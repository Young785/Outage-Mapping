// Canonical normalized outage format — all adapters output this shape
export type NormalizedOutage = {
  id: string;
  source: "xcel" | "connexus" | "user" | "manual" | "simulation";
  lat: number | null;
  lng: number | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zipCode: string | null;
  customers: number;
  outageType: string;
  cause: string | null;
  etr: string | null;
  crewStatus: string | null;
  outageImpact: string | null;
};

export type AdapterResult = {
  outages: NormalizedOutage[];
  rawData: unknown;
  source: "xcel" | "connexus";
  fetchedAt: string;
  error: string | null;
  schemaWarnings: string[];
};
