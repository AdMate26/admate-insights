/**
 * Minimal read-only Meta Graph API client — server-only.
 *
 * - The access token travels only in the Authorization header, never in a URL,
 *   so it cannot leak through logs or `paging.next` links.
 * - Pagination only follows links on graph.facebook.com, so the token is never
 *   sent to another host.
 * - Errors are classified into a small set of kinds with fixed, human-readable
 *   messages. Meta's raw error text is never surfaced; only the numeric code,
 *   subcode and trace id are logged, for debugging.
 */

import type { MetaErrorKind } from "../live-connection";
import type { MetaConfig } from "./config.server";

const GRAPH_HOST = "graph.facebook.com";
const REQUEST_TIMEOUT_MS = 8000;
const MAX_PAGES = 10;

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const PUBLIC_MESSAGES: Record<MetaErrorKind, string> = {
  not_configured: "Meta isn't configured on the server yet.",
  token_invalid:
    "The Meta access token is invalid or has expired. Generate a new token and update META_ACCESS_TOKEN.",
  permission:
    "The Meta token doesn't have access to this ad account. It needs the ads_read permission.",
  not_found: "The configured Meta ad account couldn't be found.",
  rate_limited: "Meta is limiting requests right now. Please try again in a few minutes.",
  unavailable: "Meta couldn't be reached. Please try again shortly.",
  unknown: "Meta returned an unexpected error. Please try again later.",
};

export class MetaApiError extends Error {
  readonly kind: MetaErrorKind;
  readonly code: number | undefined;
  readonly subcode: number | undefined;
  readonly traceId: string | undefined;

  constructor(
    kind: MetaErrorKind,
    details: {
      code?: number | undefined;
      subcode?: number | undefined;
      traceId?: string | undefined;
    } = {},
  ) {
    super(PUBLIC_MESSAGES[kind]);
    this.name = "MetaApiError";
    this.kind = kind;
    this.code = details.code;
    this.subcode = details.subcode;
    this.traceId = details.traceId;
  }

  /** Safe to show users: fixed text, no secrets or raw API output. */
  get publicMessage(): string {
    return PUBLIC_MESSAGES[this.kind];
  }
}

/** Map a Graph API error (code / subcode / HTTP status) to an error kind. */
export function classifyGraphError(
  code: number | undefined,
  subcode: number | undefined,
  httpStatus: number,
): MetaErrorKind {
  if (code === 190 || code === 102) return "token_invalid";
  if (code === 10 || (code !== undefined && code >= 200 && code <= 299)) return "permission";
  if (code === 100 && subcode === 33) return "not_found";
  if (
    code === 4 ||
    code === 17 ||
    code === 32 ||
    code === 613 ||
    (code !== undefined && code >= 80000 && code <= 80014)
  ) {
    return "rate_limited";
  }
  if (code === 1 || code === 2 || httpStatus >= 500) return "unavailable";
  if (httpStatus === 401) return "token_invalid";
  if (httpStatus === 403) return "permission";
  if (httpStatus === 404) return "not_found";
  if (httpStatus === 429) return "rate_limited";
  return "unknown";
}

async function appSecretProof(token: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(token));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type GraphErrorBody = {
  error?: { code?: number; error_subcode?: number; fbtrace_id?: string; type?: string };
};

export type GraphClient = {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  getAll<T>(path: string, params?: Record<string, string>): Promise<T[]>;
};

export function createGraphClient(config: MetaConfig, fetchImpl: FetchLike = fetch): GraphClient {
  let proof: Promise<string> | null = null;

  async function request<T>(url: URL): Promise<T> {
    if (url.hostname !== GRAPH_HOST) throw new MetaApiError("unknown");
    if (config.appSecret) {
      proof ??= appSecretProof(config.accessToken, config.appSecret);
      url.searchParams.set("appsecret_proof", await proof);
    }
    // Never forward a token that may have come back inside a paging link.
    url.searchParams.delete("access_token");

    let response: Response;
    try {
      response = await fetchImpl(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${config.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new MetaApiError("unavailable");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new MetaApiError(
        response.ok ? "unknown" : classifyGraphError(undefined, undefined, response.status),
      );
    }

    const err = (body as GraphErrorBody)?.error;
    if (!response.ok || err) {
      const kind = classifyGraphError(err?.code, err?.error_subcode, response.status);
      // Log identifiers only — never the message, URL or token.
      console.warn("[meta] graph request failed", {
        kind,
        status: response.status,
        code: err?.code,
        subcode: err?.error_subcode,
        traceId: err?.fbtrace_id,
      });
      throw new MetaApiError(kind, {
        code: err?.code,
        subcode: err?.error_subcode,
        traceId: err?.fbtrace_id,
      });
    }
    return body as T;
  }

  function buildUrl(path: string, params: Record<string, string> = {}): URL {
    const url = new URL(`https://${GRAPH_HOST}/${config.apiVersion}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return url;
  }

  return {
    get: <T>(path: string, params?: Record<string, string>) => request<T>(buildUrl(path, params)),

    async getAll<T>(path: string, params?: Record<string, string>): Promise<T[]> {
      const rows: T[] = [];
      let url: URL | null = buildUrl(path, params);
      for (let page = 0; url && page < MAX_PAGES; page++) {
        const body: { data?: T[]; paging?: { next?: string } } = await request(url);
        if (Array.isArray(body.data)) rows.push(...body.data);
        const next = body.paging?.next;
        url = next ? new URL(next) : null;
      }
      return rows;
    },
  };
}
