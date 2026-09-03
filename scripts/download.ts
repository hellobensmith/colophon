/**
 * Resumable download.
 *
 * ebible.org closes large transfers early and often: fetching the 2.8 MB ASV
 * archive in one call frequently ends mid-stream. The body is therefore read
 * chunk by chunk so that whatever arrived before a failure is kept, and the
 * next attempt asks only for the remaining bytes with a Range header. Reading
 * the whole body at once would discard the partial data and the retry could
 * never make progress.
 */

export interface DownloadOptions {
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly maxAttempts?: number;
  readonly onProgress?: (received: number, expected: number, attempt: number) => void;
}

export class DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadError";
  }
}

/** Reads the expected byte count from a HEAD request. */
export async function expectedSize(url: string, fetchImpl: typeof fetch): Promise<number> {
  const response = await fetchImpl(url, { method: "HEAD" });
  if (!response.ok) {
    throw new DownloadError(`HEAD ${url} failed with ${response.status} ${response.statusText}`);
  }
  const header = response.headers.get("content-length");
  if (header === null) {
    throw new DownloadError(`${url} did not report a content-length, so the download cannot be verified`);
  }
  const size = Number.parseInt(header, 10);
  if (!Number.isInteger(size) || size <= 0) {
    throw new DownloadError(`${url} reported an unusable content-length: "${header}"`);
  }
  return size;
}

export async function downloadWithResume(
  url: string,
  options: DownloadOptions = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxAttempts = options.maxAttempts ?? 8;
  const expected = await expectedSize(url, fetchImpl);

  const chunks: Uint8Array[] = [];
  let received = 0;

  for (let attempt = 1; attempt <= maxAttempts && received < expected; attempt += 1) {
    const response = await fetchImpl(url, {
      headers: received > 0 ? { Range: `bytes=${received}-` } : {},
    });
    if (!response.ok) {
      throw new DownloadError(`GET ${url} failed with ${response.status} ${response.statusText}`);
    }
    if (received > 0 && response.status !== 206) {
      throw new DownloadError(
        `${url} ignored a Range request (status ${response.status}); cannot resume safely`,
      );
    }
    if (response.body === null) {
      throw new DownloadError(`GET ${url} returned no body`);
    }

    const reader = response.body.getReader();
    let failure: unknown = null;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value !== undefined && value.byteLength > 0) {
          chunks.push(value);
          received += value.byteLength;
        }
      }
    } catch (error) {
      // Keep the bytes already read; the next attempt resumes from here.
      failure = error;
    } finally {
      reader.releaseLock();
    }

    options.onProgress?.(received, expected, attempt);
    if (failure !== null && received >= expected) break;
  }

  if (received !== expected) {
    throw new DownloadError(
      `Download incomplete after ${maxAttempts} attempt(s): got ${received} of ${expected} bytes`,
    );
  }

  const merged = new Uint8Array(expected);
  let cursor = 0;
  for (const chunk of chunks) {
    merged.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return merged;
}
