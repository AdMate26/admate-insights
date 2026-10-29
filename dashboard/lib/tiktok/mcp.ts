import "server-only";
import type { TikTokMcpServer } from "./config";

// Minimal, read-only client for TikTok for Business MCP. Only the tools in
// READ_TOOLS can ever be called; each must also be listed by the server as
// read-only, and calls with unknown required parameters are refused (the live
// tool schemas are verified during the first real-account test).

export const READ_TOOLS = new Set(["auth_advertiser_get", "advertiser_info_get"]);
const PROTOCOL_VERSION = "2025-06-18";
const MAX_BYTES = 4 * 1024 * 1024;

type Json = Record<string, unknown>;
type Tool = { name: string; annotations?: { readOnlyHint?: boolean }; inputSchema?: { required?: string[]; properties?: Record<string, unknown> } };

export class TikTokMcpError extends Error {
  constructor(public readonly code: "forbidden_tool" | "schema" | "provider" | "unauthorized", message: string) {
    super(message);
    this.name = "TikTokMcpError";
  }
}

const isObject = (v: unknown): v is Json => !!v && typeof v === "object" && !Array.isArray(v);

async function readBody(response: Response, id: number): Promise<Json> {
  const text = await response.text();
  if (text.length > MAX_BYTES) throw new TikTokMcpError("provider", "TikTok response too large");
  const candidates = response.headers.get("content-type")?.includes("text/event-stream")
    ? text.split(/\r?\n\r?\n/).map((event) => event.split(/\r?\n/).filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("\n"))
    : [text];
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isObject(parsed) && parsed.id === id) return parsed;
    } catch {
      /* not this event */
    }
  }
  throw new TikTokMcpError("provider", "TikTok returned no usable answer");
}

export class TikTokMcp {
  private id = 0;
  private session: string | null = null;
  private tools: Tool[] | null = null;

  constructor(
    private readonly server: TikTokMcpServer,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async rpc(method: string, params?: Json, notification = false): Promise<Json> {
    const id = ++this.id;
    const headers = new Headers({
      authorization: `Bearer ${this.token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
    });
    if (this.session) headers.set("mcp-session-id", this.session);
    let response: Response;
    try {
      response = await this.fetcher(this.server, {
        method: "POST",
        headers,
        body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id }), method, ...(params ? { params } : {}) }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new TikTokMcpError("provider", "TikTok could not be reached");
    }
    if (response.status === 401 || response.status === 403) throw new TikTokMcpError("unauthorized", "TikTok refused the authorization");
    if (!response.ok) throw new TikTokMcpError("provider", "TikTok request failed");
    if (method === "initialize") this.session = response.headers.get("mcp-session-id");
    if (notification) return {};
    const envelope = await readBody(response, id);
    if (envelope.error || !isObject(envelope.result)) throw new TikTokMcpError("provider", "TikTok tool call failed");
    return envelope.result;
  }

  async initialize() {
    await this.rpc("initialize", { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "AdMate", version: "1" } });
    await this.rpc("notifications/initialized", undefined, true);
  }

  private async listTools(): Promise<Tool[]> {
    if (this.tools) return this.tools;
    const result = await this.rpc("tools/list", {});
    this.tools = Array.isArray(result.tools) ? (result.tools.filter((t) => isObject(t) && typeof t.name === "string") as Tool[]) : [];
    return this.tools;
  }

  /** Calls one allowed read-only tool and returns TikTok's `data` object. */
  async read(name: string, args: Json): Promise<Json> {
    if (!READ_TOOLS.has(name)) throw new TikTokMcpError("forbidden_tool", "This TikTok tool is not allowed");
    const tool = (await this.listTools()).find((t) => t.name === name);
    if (!tool || tool.annotations?.readOnlyHint !== true) throw new TikTokMcpError("schema", "TikTok tool is unavailable or not read-only");
    const missing = (tool.inputSchema?.required ?? []).filter((key) => !(key in args));
    if (missing.length) throw new TikTokMcpError("schema", "TikTok tool needs parameters AdMate does not send");
    const result = await this.rpc("tools/call", { name, arguments: args });
    if (result.isError === true) throw new TikTokMcpError("provider", "TikTok tool returned an error");
    const text = Array.isArray(result.content) ? result.content.find((c) => isObject(c) && c.type === "text") : null;
    let payload: unknown = isObject(result.structuredContent) ? result.structuredContent : null;
    if (!payload && isObject(text) && typeof text.text === "string") {
      try {
        payload = JSON.parse(text.text);
      } catch {
        throw new TikTokMcpError("schema", "TikTok returned an unexpected format");
      }
    }
    if (!isObject(payload) || payload.code !== 0 || !isObject(payload.data)) throw new TikTokMcpError("provider", "TikTok returned an error");
    return payload.data;
  }
}

export interface TikTokAdvertiser {
  id: string;
  name: string;
  currency: string | null;
  timezone: string | null;
  status: string | null;
}

const text = (v: unknown, max = 200) => (typeof v === "string" ? v.slice(0, max) : null);
const advertiserId = (v: unknown) => {
  const id = typeof v === "number" ? String(v) : typeof v === "string" ? v : "";
  return /^\d{5,30}$/.test(id) ? id : null;
};

/** The advertisers this person authorized, with name, currency and time zone. Read-only. */
export async function listAuthorizedAdvertisers(client: TikTokMcp): Promise<TikTokAdvertiser[]> {
  await client.initialize();
  const authorized = await client.read("auth_advertiser_get", {});
  const list = Array.isArray(authorized.list) ? authorized.list : [];
  const ids = [...new Set(list.map((row) => (isObject(row) ? advertiserId(row.advertiser_id) : null)).filter((id): id is string => !!id))].slice(0, 100);
  if (!ids.length) return [];
  const info = await client.read("advertiser_info_get", { advertiser_ids: ids, fields: ["advertiser_id", "name", "currency", "timezone", "status"] });
  const details = new Map<string, Json>();
  for (const row of Array.isArray(info.list) ? info.list : []) {
    const id = isObject(row) ? advertiserId(row.advertiser_id) : null;
    if (id && isObject(row)) details.set(id, row);
  }
  return ids.map((id) => {
    const d = details.get(id);
    const fallback = list.find((row) => isObject(row) && advertiserId(row.advertiser_id) === id) as Json | undefined;
    return { id, name: text(d?.name) ?? text(fallback?.advertiser_name) ?? id, currency: text(d?.currency, 10), timezone: text(d?.timezone, 64), status: text(d?.status, 40) };
  });
}
