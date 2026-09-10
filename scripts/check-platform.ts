/**
 * Re-measures the platform facts that docs/STATE.md asserts, and fails when any
 * of them has drifted.
 *
 * This exists because of a specific failure that has now happened twice. A
 * number gets measured once, written into STATE.md as prose, and then trusted
 * forever. On 7 September 2026 three such facts were wrong at the same time —
 * the bundle limit, the CPU budget, and the caching mechanism — and one of them
 * had already produced an architecture recommendation before a deploy behaved
 * oddly enough to expose it.
 *
 * The coverage ledger in src/usfx.ts is the model: it works because it is
 * arithmetic that runs, not a claim someone wrote down. These are the same idea
 * applied to the things this project does not control.
 *
 *   bun run check:platform              # cheap checks against the deployed Worker
 *   bun run check:platform --probe-limit # also probe the real bundle limit
 *
 * The limit probe deploys a throwaway Worker padded with incompressible data and
 * deletes it again. It is opt-in because it is slow and it writes to the
 * account, which the other checks do not.
 */

export {};

const BASE = process.env["PLATFORM_BASE_URL"] ?? "https://colophon.hellobensmith.workers.dev";
const PROBE_LIMIT = process.argv.includes("--probe-limit");

/**
 * What STATE.md currently claims. When a check fails, the fix is to re-measure,
 * change the number *here*, and change it in STATE.md in the same commit — not
 * to widen the bound until it passes.
 */
const CLAIMS = {
  /** Bundle limit for this account's plan, in MB gzip. Verified by --probe-limit. */
  bundleLimitMb: 10,
  /** Free-tier limit, recorded only so a plan downgrade is caught. */
  freeTierLimitMb: 3,
  /**
   * CPU is claimed as two numbers because it is two things.
   *
   * The median tracks the code: it moves when a query gets more expensive, and
   * is what a regression shows up in. The worst tracks cold isolates, which is
   * noise from this script's point of view — a request landing on a fresh
   * isolate pays the posting-cache warm, and a run straight after a deploy
   * finds nothing but fresh isolates.
   *
   * Re-measured across eight runs on 10 September 2026, immediately after
   * deploying the DRA search index and the Greek psalm-numbering rewrite:
   * median 9-39 ms, worst 47-112 ms (excluding the run taken immediately
   * post-deploy, which read higher still — cold isolates everywhere, exactly
   * the noise these two numbers exist to separate from a real regression).
   * Both ranges run wider than the 7 September baseline (3-18 / 21-48); two
   * more indexed translations and a heavier passage-read path are enough to
   * explain the shift without pointing at a specific regression, but the
   * variance itself — not just the ceiling — grew, and is worth a look if it
   * widens again.
   *
   * These bounds are set from that spread with headroom. If one fails,
   * re-measure and find out which of the two moved — do not widen it to pass.
   */
  medianCpuMs: 45,
  worstCpuMs: 130,
  /** Whether the platform enforces a CPU cap by terminating requests. */
  cpuCapEnforced: false,
  /**
   * Worker invocations expected from 8 identical cacheable requests, measured
   * through curl. This is what the [cache] block buys, and the number that
   * silently became 8 when the block was removed.
   */
  invocationsPerEightIdentical: 1,
} as const;

const failures: string[] = [];
const notes: string[] = [];

function report(ok: boolean, label: string, detail: string): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${label.padEnd(34)} ${detail}`);
  if (!ok) failures.push(`${label}: ${detail}`);
}

async function run(command: readonly string[]): Promise<{ code: number; out: string }> {
  const process_ = Bun.spawn([...command], { stdout: "pipe", stderr: "pipe" });
  const [out, error] = await Promise.all([
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ]);
  return { code: await process_.exited, out: out + error };
}

// ---------------------------------------------------------------------------
// 1. Bundle size, and the limit it is measured against.
// ---------------------------------------------------------------------------

const dryRun = await run(["wrangler", "deploy", "--dry-run"]);
const sizeMatch = dryRun.out.match(/gzip:\s*([\d.]+)\s*KiB/);
if (sizeMatch === null) {
  report(false, "bundle size", `could not parse wrangler output (exit ${dryRun.code})`);
} else {
  const mb = Number(sizeMatch[1]) / 1024;
  const headroom = CLAIMS.bundleLimitMb - mb;
  report(
    headroom > 0,
    "bundle size",
    `${mb.toFixed(2)} MB gzip, ${headroom.toFixed(2)} MB under the ${CLAIMS.bundleLimitMb} MB limit`,
  );
  if (mb > CLAIMS.freeTierLimitMb) {
    notes.push(
      `The bundle is ${mb.toFixed(2)} MB, over the ${CLAIMS.freeTierLimitMb} MB free-tier limit. ` +
        `This Worker cannot be deployed on a free account as it stands.`,
    );
  }
}

/**
 * The [cache] block must stay in wrangler.toml.
 *
 * Wrangler warns "Unexpected fields found in top-level field: cache" and then
 * honours it anyway. That warning is not evidence the key is dead: removing it
 * on 7 September 2026 switched edge caching off, taking 8 identical requests
 * from 1 Worker invocation to 8. Assert the key is present, and let the
 * invocation count below prove it is working.
 */
const config = await Bun.file(new URL("../wrangler.toml", import.meta.url).pathname).text();
const cacheEnabled = /\[cache\][\s\S]*?enabled\s*=\s*true/.test(config);
report(
  cacheEnabled,
  "wrangler [cache] block",
  cacheEnabled ? "present (wrangler warns about it; it works anyway)" : "MISSING — caching will be off",
);

// ---------------------------------------------------------------------------
// 2 & 3. Caching and CPU, both read from the platform in one tail session.
// ---------------------------------------------------------------------------

/**
 * Both questions are answered by counting what actually reached the Worker, so
 * they share one `wrangler tail`.
 *
 * The cache question is deliberately *not* asked by reading `cf-cache-status`.
 * Bun's fetch never receives that header — it is absent from the response
 * entirely, though curl gets it — so a header check here silently reports zero
 * hits forever. The claim worth testing is the one STATE.md actually makes:
 * that a cache hit does not run the Worker. Counting invocations tests that
 * directly, and does not care what any header says.
 */

/** Cache-busted, and deliberately the most expensive shapes the API allows. */
const CPU_PROBES: readonly string[] = [
  "/search?q=good+shepherd",
  "/search?q=the&limit=1",
  "/search?q=and+it+came+to+pass+in+the+days+of+the+king",
  "/search?q=and+the+of+that+to+in+he+unto+for+jehovah+his+shall",
  "/passages?ref=Psalm%20119:1-176",
  "/books",
];

const tail = Bun.spawn(["wrangler", "tail", "--format", "json"], {
  stdout: "pipe",
  stderr: "ignore",
});

/**
 * Streamed rather than redirected to a file. Writing the tail to a file loses
 * whatever is still buffered when the process is killed, which silently drops
 * exactly the events this script cares about — they are the last ones written.
 */
let captured = "";
const pump = (async () => {
  const decoder = new TextDecoder();
  for await (const chunk of tail.stdout as ReadableStream<Uint8Array>) {
    captured += decoder.decode(chunk, { stream: true });
  }
})();

async function get(url: string): Promise<void> {
  await fetch(url).then((response) => response.arrayBuffer());
}

/** Waits until `predicate` holds, or gives up. Returns whether it held. */
async function waitFor(predicate: () => boolean, seconds: number): Promise<boolean> {
  for (let elapsed = 0; elapsed < seconds; elapsed += 1) {
    if (predicate()) return true;
    await Bun.sleep(1_000);
  }
  return predicate();
}

/** wrangler tail needs a moment to attach; requests sent before it are invisible. */
let attached = false;
for (let attempt = 0; attempt < 20 && !attached; attempt += 1) {
  await get(`${BASE}/books?tailwarm=${crypto.randomUUID()}`);
  attached = await waitFor(() => captured.includes("cpuTime"), 2);
}

if (!attached) {
  tail.kill();
  report(false, "production cpu", "wrangler tail never attached; cannot measure");
  report(false, "edge caching", "wrangler tail never attached; cannot measure");
} else {
  const cpuMarker = `cpu${crypto.randomUUID().replaceAll("-", "")}`;
  const cacheMarker = `cache${crypto.randomUUID().replaceAll("-", "")}`;

  for (let round = 0; round < 3; round += 1) {
    for (const path of CPU_PROBES) {
      await get(`${BASE}${path}${path.includes("?") ? "&" : "?"}pc=${cpuMarker}${round}`);
    }
  }

  // One URL, eight times — but through curl, not fetch.
  //
  // Bun's fetch is not served from Cloudflare's edge cache: the same URL that
  // curl reports as MISS,HIT,HIT... invokes the Worker on every request when
  // fetched from Bun, and the response carries no cf-cache-status at all. Using
  // fetch here would report caching as broken while it works fine for real
  // clients.
  //
  // All eight requests go out on one curl invocation, not eight separate
  // processes, so the connection is reused rather than reopened. Reopening it
  // let anycast route each request to a different Cloudflare datacenter — a
  // single run measured ATL, MIA, DFW, BOS and back to MIA across eight
  // requests — and Cloudflare's tiered cache does not promise the fresh entry
  // is instantly visible across datacenters, so this counted real
  // cross-datacenter propagation lag as a caching failure. Pinned to one
  // connection, and so one datacenter, the same request reads MISS once and
  // HIT seven times, every time — confirmed over four separate runs before
  // relying on it here.
  const cacheUrl = `${BASE}/passages?ref=Romans%208:28&pc=${cacheMarker}`;
  await run(["curl", "-s", "-o", "/dev/null", ...Array(8).fill(cacheUrl)]);

  // Wait for the cache probe's own event too, not just the CPU probes'. The
  // cache burst fires on one fast, reused connection and can finish — and its
  // tail event arrive — on a different schedule than the 18 separately-opened
  // CPU probe connections. Waiting on the CPU marker alone let the cache
  // marker's single expected event still be in flight when the fixed sleep
  // below ran out, misread as "0 invocations" rather than "not arrived yet".
  const expected = CPU_PROBES.length * 3;
  await waitFor(
    () => captured.split(cpuMarker).length - 1 >= expected && captured.includes(cacheMarker),
    40,
  );
  await Bun.sleep(5_000);
  tail.kill();
  await pump.catch(() => {});

  // wrangler emits pretty-printed objects, not one per line, so this cannot be
  // parsed by splitting on newlines. That mistake silently yields zero events.
  const events: Record<string, any>[] = [];
  let cursor = 0;
  while (cursor < captured.length) {
    const start = captured.indexOf("{", cursor);
    if (start === -1) break;
    let depth = 0;
    let end = start;
    let inString = false;
    let escaped = false;
    for (; end < captured.length; end += 1) {
      const character = captured[end]!;
      if (escaped) { escaped = false; continue; }
      if (character === "\\") { escaped = true; continue; }
      if (character === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (character === "{") depth += 1;
      else if (character === "}") { depth -= 1; if (depth === 0) { end += 1; break; } }
    }
    if (depth !== 0) break; // truncated trailing object, expected on kill
    try {
      events.push(JSON.parse(captured.slice(start, end)));
    } catch {
      // Not an event object; skip it.
    }
    cursor = end;
  }

  const urlOf = (event: Record<string, any>): string =>
    String(event["event"]?.request?.url ?? "");

  // --- caching -------------------------------------------------------------
  const cacheInvocations = events.filter((event) => urlOf(event).includes(cacheMarker)).length;
  report(
    cacheInvocations > 0 && cacheInvocations <= CLAIMS.invocationsPerEightIdentical,
    "edge caching",
    cacheInvocations === 0
      ? "0 invocations — cannot distinguish caching from a lost tail"
      : `8 identical requests invoked the Worker ${cacheInvocations}x ` +
        `(claim: ${CLAIMS.invocationsPerEightIdentical})`,
  );

  // A response is only cacheable because the Worker says so. If this header
  // stops being set the caching disappears, and nothing else here would fail.
  const headerProbe = await fetch(`${BASE}/passages?ref=John%203:16`);
  await headerProbe.arrayBuffer();
  const cacheControl = headerProbe.headers.get("cache-control") ?? "";
  // Deliberately asserts the header is cacheable but NOT immutable: a deploy
  // does not purge this cache, so an immutable year would mask a correction
  // for a year. See the comment on VERSE_DATA in src/index.ts.
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 0);
  report(
    maxAge > 0 && maxAge <= 86_400 && !cacheControl.includes("immutable"),
    "cache-control header",
    cacheControl === "" ? "absent" : cacheControl,
  );

  // --- cpu -----------------------------------------------------------------
  const mine = events.filter((event) => urlOf(event).includes(cpuMarker));
  const cpuTimes = mine
    .map((event) => event["cpuTime"])
    .filter((value): value is number => typeof value === "number")
    .sort((a, b) => a - b);

  if (cpuTimes.length === 0) {
    report(false, "production cpu", `no cpuTime events matched (${events.length} events seen)`);
  } else {
    const median = cpuTimes[Math.floor(cpuTimes.length / 2)]!;
    const worst = cpuTimes[cpuTimes.length - 1]!;
    report(
      median <= CLAIMS.medianCpuMs,
      "production cpu, median",
      `n=${cpuTimes.length} median=${median}ms (claim: <=${CLAIMS.medianCpuMs}ms) — tracks the code`,
    );
    report(
      worst <= CLAIMS.worstCpuMs,
      "production cpu, worst",
      `worst=${worst}ms (claim: <=${CLAIMS.worstCpuMs}ms) — cold isolates, high right after a deploy`,
    );

    // Whether a cap is enforced is a different question from how much CPU is
    // used, and it is the one that was wrong for months.
    const terminated = mine.filter((event) =>
      ["exceededCpu", "exceededMemory"].includes(String(event["outcome"])),
    );
    report(
      (terminated.length > 0) === CLAIMS.cpuCapEnforced,
      "cpu cap enforcement",
      CLAIMS.cpuCapEnforced
        ? `${terminated.length} of ${mine.length} terminated, cap claimed enforced`
        : `0 of ${mine.length} terminated; no cap enforced, as claimed`,
    );
  }
}

// ---------------------------------------------------------------------------
// 4. The bundle limit itself, opt-in.
// ---------------------------------------------------------------------------

if (PROBE_LIMIT) {
  const directory = `${process.env["TMPDIR"] ?? "/tmp"}/colophon-limit-probe`;
  const name = "colophon-limit-probe";
  // Sized just under the claimed limit: if this deploys, the limit is at least
  // this, which is the only direction that matters.
  const targetMb = CLAIMS.bundleLimitMb - 1;
  const bytes = new Uint8Array(Math.floor(targetMb * 1024 * 1024 * 0.75));
  crypto.getRandomValues(bytes);
  const padding = Buffer.from(bytes).toString("base64");

  await Bun.write(`${directory}/pad.ts`, `export const PAD: string = ${JSON.stringify(padding)};\n`);
  await Bun.write(
    `${directory}/index.ts`,
    'import { PAD } from "./pad.ts";\nexport default { fetch: () => new Response(String(PAD.length)) };\n',
  );
  await Bun.write(
    `${directory}/wrangler.toml`,
    `name = "${name}"\nmain = "index.ts"\ncompatibility_date = "2026-09-02"\n`,
  );

  const deployed = await run(["wrangler", "deploy", "--cwd", directory]);
  const probeSize = deployed.out.match(/gzip:\s*([\d.]+)\s*KiB/);
  const probeMb = probeSize ? Number(probeSize[1]) / 1024 : 0;
  report(
    deployed.code === 0,
    "bundle limit probe",
    deployed.code === 0
      ? `${probeMb.toFixed(2)} MB gzip accepted, so the limit is at least that`
      : `rejected at ${probeMb.toFixed(2)} MB gzip — the ${CLAIMS.bundleLimitMb} MB claim is wrong`,
  );
  const deleted = await run(["wrangler", "delete", "--name", name, "--force"]);
  report(deleted.code === 0, "probe cleanup", deleted.code === 0 ? `deleted ${name}` : `LEFT BEHIND: ${name}`);
} else {
  notes.push("Bundle limit not probed. Re-run with --probe-limit to verify it.");
}

// ---------------------------------------------------------------------------

console.log("");
for (const note of notes) console.log(`note  ${note}`);
if (failures.length > 0) {
  console.log(`\n${failures.length} platform claim(s) have drifted:`);
  for (const failure of failures) console.log(`  - ${failure}`);
  console.log("\nRe-measure, then correct both CLAIMS above and docs/STATE.md in one commit.");
  process.exit(1);
}
console.log("All platform claims still hold.");
