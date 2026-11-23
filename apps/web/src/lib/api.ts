import type {
  CatchmentHexResponse,
  FlowPathsResponse,
  GenericFeatureCollection,
  MethodologyReport,
  OrganicZonesResponse,
  PortfolioScreenResponse,
  ScreenRequest,
  SimulationParams,
  StreetDepthResponse,
  TerrainPatchResponse,
  ValidationReport,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000");

async function handleJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `API request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function simulateOrganicZones(
  slug: string,
  params: SimulationParams,
  signal?: AbortSignal
): Promise<OrganicZonesResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/zones/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  return handleJson<OrganicZonesResponse>(res);
}

export async function simulateH3Grid(
  slug: string,
  params: SimulationParams,
  signal?: AbortSignal
): Promise<CatchmentHexResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    signal,
  });
  return handleJson<CatchmentHexResponse>(res);
}

export async function screenPortfolioSites(
  slug: string,
  req: ScreenRequest,
  signal?: AbortSignal
): Promise<PortfolioScreenResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/screen`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
    signal,
  });
  return handleJson<PortfolioScreenResponse>(res);
}

export async function fetchOverlay(
  slug: string,
  layer: "drains" | "parks" | "underpasses" | "incidents" | "micro-drains",
  signal?: AbortSignal
): Promise<GenericFeatureCollection> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/${layer}`, { signal });
  return handleJson<GenericFeatureCollection>(res);
}

export async function fetchValidation(slug: string, signal?: AbortSignal): Promise<ValidationReport> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/validation`, { signal });
  return handleJson<ValidationReport>(res);
}

export async function fetchMethodology(slug: string, signal?: AbortSignal): Promise<MethodologyReport> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/methodology`, { signal });
  return handleJson<MethodologyReport>(res);
}

export async function fetchFlowPaths(slug: string, signal?: AbortSignal): Promise<FlowPathsResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/flow-paths`, { signal });
  return handleJson<FlowPathsResponse>(res);
}

export async function fetchTerrainPatch(
  slug: string,
  zoneId: string,
  signal?: AbortSignal
): Promise<TerrainPatchResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/${slug}/zones/${encodeURIComponent(zoneId)}/terrain-patch`, {
    signal,
  });
  return handleJson<TerrainPatchResponse>(res);
}

export async function fetchStreetDepthFlood(
  imageId: string,
  accessToken: string,
  signal?: AbortSignal
): Promise<StreetDepthResponse> {
  const res = await fetch(`${API_BASE}/v1/catchments/street/depth-flood`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_id: imageId, access_token: accessToken }),
    signal,
  });
  return handleJson<StreetDepthResponse>(res);
}
