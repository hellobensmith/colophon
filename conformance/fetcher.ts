/**
 * The one place the suite touches the network.
 *
 * Every API tested here is a free service run by someone who did not ask to be
 * measured, so the rules are: cache everything to disk and replay by default,
 * never issue concurrent requests to one host, leave at least a second between
 * them, and identify the project in the User-Agent so a maintainer seeing the
 * traffic can find out what it is.
 *
 * Caching is not only courtesy. A finding has to be reproducible months later,
 * and an API that has since been fixed would otherwise erase the evidence that
 * it needed fixing.
 */

import { mkdir } from "node:fs/promises";

const CACHE_DIR = new URL("./.cache/", import.meta.url).pathname;

const USER_AGENT =
  "scripture-conformance/0.1 (+https://github.com/hellobensmith/bible-api; " +
  "measuring Scripture API behaviour; contact via repository issues)";

/** Minimum gap between two requests to the same host. */
const HOST_INTERVAL_MS = 1_100;

const lastRequestAt = new Map<string, number>();

export interface FetchOptions {
  /** Replay from disk only; never touch the network. */
  readonly cachedOnly?: boolean;
  /** Ignore any cached copy and re-fetch. */
  readonly refresh?: boolean;
}

export interface RawResponse {
  readonly status: number;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly fromCache: boolean;
  readonly transportError: string | null;
}

async function cachePath(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${CACHE_DIR}${hex}.json`;
}

async function readCache(url: string): Promise<RawResponse | null> {
  const file = Bun.file(await cachePath(url));
  if (!(await file.exists())) return null;
  const stored = (await file.json()) as Omit<RawResponse, "fromCache">;
  return { ...stored, fromCache: true };
}

async function writeCache(url: string, response: RawResponse): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  const { status, body, headers, transportError } = response;
  await Bun.write(
    await cachePath(url),
    `${JSON.stringify({ url, status, body, headers, transportError, storedAt: new Date().toISOString() }, null, 1)}\n`,
  );
}

async function waitForHost(host: string): Promise<void> {
  const previous = lastRequestAt.get(host);
  if (previous !== undefined) {
    const elapsed = Date.now() - previous;
    if (elapsed < HOST_INTERVAL_MS) {
      await Bun.sleep(HOST_INTERVAL_MS - elapsed);
    }
  }
  lastRequestAt.set(host, Date.now());
}

export async function request(url: string, options: FetchOptions = {}): Promise<RawResponse> {
  if (!options.refresh) {
    const cached = await readCache(url);
    if (cached !== null) return cached;
  }
  if (options.cachedOnly) {
    return {
      status: 0,
      body: "",
      headers: {},
      fromCache: true,
      transportError: "no cached response, and --cached forbids the network",
    };
  }

  const host = new URL(url).host;
  await waitForHost(host);

  let response: RawResponse;
  try {
    const received = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/json, text/plain, */*" },
      signal: AbortSignal.timeout(20_000),
    });
    const headers: Record<string, string> = {};
    received.headers.forEach((value, key) => {
      headers[key] = value;
    });
    response = {
      status: received.status,
      body: await received.text(),
      headers,
      fromCache: false,
      transportError: null,
    };
  } catch (error) {
    response = {
      status: 0,
      body: "",
      headers: {},
      fromCache: false,
      transportError: (error as Error).message,
    };
  }

  // A transport failure is not cached: the host may simply have been down, and
  // freezing that into the record would turn a blip into a permanent finding.
  if (response.transportError === null) await writeCache(url, response);
  return response;
}

/** Parses a body as JSON, returning null rather than throwing on HTML or prose. */
export function asJson(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}
