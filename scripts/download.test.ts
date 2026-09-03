import { describe, expect, test } from "bun:test";
import { downloadWithResume, expectedSize, DownloadError } from "./download.ts";

const PAYLOAD = new Uint8Array(1000).map((_, index) => index % 251);

/**
 * A fetch stand-in that serves PAYLOAD but cuts each response short after
 * `chunkSize` bytes, mimicking how ebible.org closes large transfers early.
 */
function truncatingFetch(options: {
  chunkSize: number;
  failures: number;
  total?: number;
}): { impl: typeof fetch; calls: () => string[] } {
  const calls: string[] = [];
  let served = 0;
  const total = options.total ?? PAYLOAD.byteLength;

  const impl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "HEAD") {
      calls.push("HEAD");
      return new Response(null, { headers: { "content-length": String(total) } });
    }

    const rangeHeader = (init?.headers as Record<string, string> | undefined)?.["Range"];
    const start = rangeHeader === undefined ? 0 : Number.parseInt(rangeHeader.slice("bytes=".length), 10);
    calls.push(`GET ${start}-`);

    const shouldTruncate = served < options.failures;
    served += 1;
    const end = shouldTruncate ? Math.min(start + options.chunkSize, total) : total;
    const slice = PAYLOAD.slice(start, end);

    // Pull-based so the chunk is actually delivered before the stream fails,
    // which is how a truncated HTTP response behaves. Erroring inside start()
    // would discard the queued chunk instead.
    let delivered = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (!delivered) {
          delivered = true;
          controller.enqueue(slice);
          return;
        }
        if (shouldTruncate) controller.error(new Error("connection closed prematurely"));
        else controller.close();
      },
    });
    return new Response(body, { status: start > 0 ? 206 : 200 });
  }) as unknown as typeof fetch;

  return { impl, calls: () => calls };
}

describe("resumable download", () => {
  test("reassembles the file across several truncated responses", async () => {
    const server = truncatingFetch({ chunkSize: 300, failures: 3 });
    const bytes = await downloadWithResume("https://example.test/file.zip", {
      fetchImpl: server.impl,
    });
    expect(bytes.byteLength).toBe(PAYLOAD.byteLength);
    expect(Array.from(bytes)).toEqual(Array.from(PAYLOAD));
    // Three truncated attempts, then a fourth that completes.
    expect(server.calls()).toEqual(["HEAD", "GET 0-", "GET 300-", "GET 600-", "GET 900-"]);
  });

  test("keeps partial bytes rather than restarting from zero", async () => {
    const server = truncatingFetch({ chunkSize: 400, failures: 1 });
    const bytes = await downloadWithResume("https://example.test/file.zip", {
      fetchImpl: server.impl,
    });
    expect(bytes.byteLength).toBe(PAYLOAD.byteLength);
    // The resume asks for byte 400 onward, proving the first 400 were retained.
    expect(server.calls()[2]).toBe("GET 400-");
  });

  test("succeeds without retrying when the first response is whole", async () => {
    const server = truncatingFetch({ chunkSize: 1000, failures: 0 });
    const bytes = await downloadWithResume("https://example.test/file.zip", {
      fetchImpl: server.impl,
    });
    expect(bytes.byteLength).toBe(PAYLOAD.byteLength);
    expect(server.calls()).toEqual(["HEAD", "GET 0-"]);
  });

  test("reports progress on each attempt", async () => {
    const server = truncatingFetch({ chunkSize: 500, failures: 1 });
    const seen: number[] = [];
    await downloadWithResume("https://example.test/file.zip", {
      fetchImpl: server.impl,
      onProgress: (received) => seen.push(received),
    });
    expect(seen).toEqual([500, 1000]);
  });

  test("gives up after the attempt limit instead of looping forever", async () => {
    const server = truncatingFetch({ chunkSize: 100, failures: 99 });
    await expect(
      downloadWithResume("https://example.test/file.zip", {
        fetchImpl: server.impl,
        maxAttempts: 3,
      }),
    ).rejects.toThrow(/incomplete after 3 attempt/);
  });

  test("refuses a server that ignores the Range header", async () => {
    let call = 0;
    const impl = (async (_input: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "HEAD") {
        return new Response(null, { headers: { "content-length": "1000" } });
      }
      call += 1;
      let delivered = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (!delivered) {
            delivered = true;
            controller.enqueue(PAYLOAD.slice(0, 400));
            return;
          }
          if (call === 1) controller.error(new Error("truncated"));
          else controller.close();
        },
      });
      // Always 200: the server is ignoring Range and restarting the file.
      return new Response(body, { status: 200 });
    }) as unknown as typeof fetch;

    await expect(
      downloadWithResume("https://example.test/file.zip", { fetchImpl: impl }),
    ).rejects.toThrow(/ignored a Range request/);
  });

  test("rejects a source that reports no content-length", async () => {
    const impl = (async () => new Response(null, {})) as unknown as typeof fetch;
    await expect(expectedSize("https://example.test/file.zip", impl)).rejects.toThrow(
      DownloadError,
    );
  });

  test("surfaces a failed HEAD", async () => {
    const impl = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
    await expect(expectedSize("https://example.test/file.zip", impl)).rejects.toThrow(/503/);
  });
});
