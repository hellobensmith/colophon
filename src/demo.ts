/**
 * The demo page served at `/`.
 *
 * Held as one string rather than a separate asset: it is the only HTML in the
 * project and has no build step or dependencies, so inlining keeps the Worker a
 * single module with no runtime file access. The page calls this same Worker
 * over relative URLs, so it behaves identically under `wrangler dev` and in
 * production.
 *
 * Every result is built with DOM methods and `textContent`, never `innerHTML`,
 * so scripture text and error details can never be interpreted as markup.
 */

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">' +
      '<rect width="32" height="32" rx="7" fill="#221f1c"/>' +
      '<path d="M9 7.5h8.5a5 5 0 0 1 5 5v12H14a5 5 0 0 1-5-5z" fill="none" stroke="#d9a441" stroke-width="1.8"/>' +
      '<path d="M15.5 9.5v15" stroke="#d9a441" stroke-width="1.8"/>' +
      "</svg>",
  );

export const DEMO_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Canon-Aware Bible API — American Standard Version</title>
<meta name="description" content="The complete American Standard Version (1901) as a REST API: reference parsing, ranked search, and three canon traditions.">
<link rel="icon" href="${FAVICON}">
<style>
@layer reset, base, layout, components;

@layer reset {
  *, *::before, *::after { box-sizing: border-box; }
  :where(body, h1, h2, h3, p, dl, dd, ol, ul, figure) { margin: 0; }
  :where(ol, ul) { padding-inline-start: 0; list-style: none; }
  :where(button, input, select) { font: inherit; color: inherit; }
  :where(svg) { display: block; }
}

@layer base {
  :root {
    color-scheme: light dark;

    /* Primitives. Warm neutrals for paper and ink, one ochre accent that reads
       as marginal annotation rather than decoration. */
    --color-paper-light: oklch(0.982 0.005 85);
    --color-paper-dark:  oklch(0.176 0.011 265);
    --color-ink-light:   oklch(0.232 0.014 265);
    --color-ink-dark:    oklch(0.929 0.008 85);
    --color-accent-seed: oklch(0.545 0.125 62);

    /* Semantics. */
    --color-surface:        light-dark(var(--color-paper-light), var(--color-paper-dark));
    --color-surface-raised: light-dark(oklch(1 0 0), oklch(0.219 0.013 265));
    --color-surface-sunken: light-dark(oklch(0.953 0.006 85), oklch(0.147 0.010 265));
    --color-text-primary:   light-dark(var(--color-ink-light), var(--color-ink-dark));
    --color-text-secondary: light-dark(oklch(0.452 0.013 265), oklch(0.737 0.010 85));
    --color-text-scripture: light-dark(oklch(0.193 0.014 265), oklch(0.947 0.008 85));
    --color-accent:         light-dark(var(--color-accent-seed), oklch(from var(--color-accent-seed) calc(l + 0.22) c h));
    --color-accent-quiet:   color-mix(in oklab, var(--color-accent) 14%, transparent);
    --color-border:         light-dark(oklch(0.886 0.007 85), oklch(0.316 0.012 265));
    --color-border-strong:  light-dark(oklch(0.772 0.010 85), oklch(0.423 0.013 265));
    --color-positive:       light-dark(oklch(0.505 0.115 150), oklch(0.760 0.110 150));
    --color-danger:         light-dark(oklch(0.503 0.165 27), oklch(0.757 0.135 27));

    /* Type. A serif carries scripture, because that is what it is; the
       interface around it stays in the system sans. */
    --font-family-sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    --font-family-serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, ui-serif, serif;
    --font-family-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;

    --font-size-xs:   clamp(0.72rem, 0.70rem + 0.10vw, 0.78rem);
    --font-size-sm:   clamp(0.82rem, 0.79rem + 0.14vw, 0.90rem);
    --font-size-base: clamp(0.95rem, 0.92rem + 0.17vw, 1.05rem);
    --font-size-lg:   clamp(1.08rem, 1.02rem + 0.30vw, 1.24rem);
    --font-size-xl:   clamp(1.30rem, 1.18rem + 0.60vw, 1.68rem);
    --font-size-2xl:  clamp(1.85rem, 1.55rem + 1.50vw, 3.00rem);

    --line-height-tight: 1.18;
    --line-height-normal: 1.55;
    --line-height-loose: 1.72;

    --measure-prose: 62ch;
    --measure-scripture: 58ch;

    --space-1: 0.25rem;
    --space-2: 0.5rem;
    --space-3: 0.75rem;
    --space-4: 1rem;
    --space-5: 1.5rem;
    --space-6: 2rem;
    --space-7: 3rem;
    --space-8: 4.5rem;

    --radius-sm: 3px;
    --radius-md: 6px;
    --duration-fast: 120ms;
    --easing-standard: cubic-bezier(0.2, 0, 0.2, 1);

    --layout-gutter: clamp(var(--space-4), 4vw, var(--space-7));
    --layout-max: 68rem;
  }

  body {
    background-color: var(--color-surface);
    color: var(--color-text-primary);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-base);
    line-height: var(--line-height-normal);
    -webkit-font-smoothing: antialiased;
  }

  h1, h2, h3 { line-height: var(--line-height-tight); font-weight: 600; text-wrap: balance; }
  h1 { font-size: var(--font-size-2xl); letter-spacing: -0.022em; }
  h2 { font-size: var(--font-size-xl); letter-spacing: -0.012em; }
  h3 { font-size: var(--font-size-sm); }
  p { text-wrap: pretty; }
  code { font-family: var(--font-family-mono); font-size: 0.92em; }

  a { color: var(--color-accent); text-underline-offset: 0.2em; }
  a:hover { text-decoration-thickness: 2px; }

  :focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: var(--radius-sm); }
}

@layer layout {
  .shell { max-inline-size: var(--layout-max); margin-inline: auto; padding-inline: var(--layout-gutter); }
  .stack > * + * { margin-block-start: var(--flow-space, var(--space-5)); }
  .cluster { display: flex; flex-wrap: wrap; gap: var(--cluster-gap, var(--space-2)); align-items: center; }
  .controls { --cluster-gap: var(--space-3); align-items: flex-end; }

  .masthead { padding-block: clamp(var(--space-6), 8vw, var(--space-8)) var(--space-6); border-block-end: 1px solid var(--color-border); }
  .sections { padding-block: var(--space-7) var(--space-8); }
  .sections > section + section { margin-block-start: var(--space-8); padding-block-start: var(--space-7); border-block-start: 1px solid var(--color-border); }
  .site-footer { padding-block: var(--space-6) var(--space-7); border-block-start: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-sm); }
}

@layer components {
  .eyebrow { font-size: var(--font-size-xs); letter-spacing: 0.09em; text-transform: uppercase; color: var(--color-text-secondary); }
  .lede { max-inline-size: var(--measure-prose); font-size: var(--font-size-lg); color: var(--color-text-secondary); }
  .prose { max-inline-size: var(--measure-prose); color: var(--color-text-secondary); }

  .status { --status-color: var(--color-text-secondary); font-size: var(--font-size-sm); color: var(--color-text-secondary); }
  .status[data-state="ok"] { --status-color: var(--color-positive); }
  .status[data-state="down"] { --status-color: var(--color-danger); }
  .status::before {
    content: "";
    inline-size: 0.5rem; block-size: 0.5rem;
    border-radius: 50%;
    background-color: var(--status-color);
    display: inline-block;
    margin-inline-end: var(--space-2);
  }

  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(8.5rem, 100%), 1fr)); gap: var(--space-4) var(--space-5); }
  .facts > div { border-inline-start: 2px solid var(--color-accent-quiet); padding-inline-start: var(--space-3); }
  .facts dt { font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-secondary); }
  .facts dd { font-size: var(--font-size-lg); font-variant-numeric: tabular-nums; }

  .field { display: flex; flex-direction: column; gap: var(--space-2); }
  .field label { font-size: var(--font-size-sm); font-weight: 600; }
  .field-hint { font-size: var(--font-size-xs); color: var(--color-text-secondary); }

  .control {
    min-block-size: 2.75rem;
    padding: var(--space-2) var(--space-3);
    background-color: var(--color-surface-raised);
    color: var(--color-text-primary);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius-md);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
  }
  .control:hover { border-color: var(--color-accent); }

  .button {
    --button-background: var(--color-accent);
    --button-text: light-dark(oklch(0.99 0 0), oklch(0.16 0.01 265));
    --button-border: transparent;
    min-block-size: 2.75rem;
    padding-inline: var(--space-5);
    background-color: var(--button-background);
    color: var(--button-text);
    border: 1px solid var(--button-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
  }
  .button:hover { --button-background: color-mix(in oklab, var(--color-accent), var(--color-text-primary) 18%); }
  /* Quieter than the primary button, but the same 44px target: WCAG 2.5.5
     applies regardless of how secondary an affordance looks. */
  .button--quiet {
    --button-background: transparent;
    --button-text: var(--color-text-secondary);
    --button-border: var(--color-border-strong);
    padding-inline: var(--space-3);
    font-family: var(--font-family-mono);
    font-weight: 400;
  }
  .button--quiet:hover {
    --button-background: var(--color-accent-quiet);
    --button-text: var(--color-text-primary);
    --button-border: var(--color-accent);
  }

  .examples { --cluster-gap: var(--space-2); }
  .examples-label { font-size: var(--font-size-xs); color: var(--color-text-secondary); }

  /* The request line: exactly what the page just asked the API for. */
  .request {
    display: flex; flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    align-items: baseline;
    padding: var(--space-3);
    background-color: var(--color-surface-sunken);
    border-radius: var(--radius-md);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    overflow-wrap: anywhere;
  }
  .request code { color: var(--color-text-primary); }
  .request .meta { margin-inline-start: auto; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .request[data-status="error"] code { color: var(--color-danger); }

  .result-heading { font-family: var(--font-family-serif); font-size: var(--font-size-lg); font-style: italic; color: var(--color-text-secondary); }

  .verses { --flow-space: var(--space-3); max-inline-size: var(--measure-scripture); }
  .verse { display: grid; grid-template-columns: 2.5rem 1fr; gap: var(--space-3); align-items: baseline; }
  .verse-number { font-family: var(--font-family-mono); font-size: var(--font-size-xs); color: var(--color-text-secondary); text-align: end; font-variant-numeric: tabular-nums; }
  .verse-text { font-family: var(--font-family-serif); font-size: var(--font-size-lg); line-height: var(--line-height-loose); color: var(--color-text-scripture); }
  .verse[data-kind="title"] .verse-text,
  .verse[data-kind="omitted"] .verse-text { font-style: italic; color: var(--color-text-secondary); }
  .note {
    margin-block-start: var(--space-2);
    padding-inline-start: var(--space-3);
    border-inline-start: 2px solid var(--color-accent-quiet);
    font-family: var(--font-family-sans);
    font-size: var(--font-size-sm);
    font-style: normal;
    line-height: var(--line-height-normal);
    color: var(--color-text-secondary);
  }
  .note b { font-weight: 600; color: var(--color-text-primary); }

  .hits { --flow-space: var(--space-4); }
  .hit { display: grid; gap: var(--space-1); }
  .hit-ref { font-family: var(--font-family-mono); font-size: var(--font-size-xs); color: var(--color-accent); }
  .hit-text { font-family: var(--font-family-serif); font-size: var(--font-size-base); max-inline-size: var(--measure-scripture); }
  mark { background-color: var(--color-accent-quiet); color: inherit; padding-inline: 0.15em; border-radius: var(--radius-sm); }

  .summary { font-size: var(--font-size-sm); color: var(--color-text-secondary); font-variant-numeric: tabular-nums; }
  .summary b { color: var(--color-text-primary); }

  /* Three numbering systems, side by side once the container allows. */
  .psalter { container-type: inline-size; }
  .psalter-columns { display: grid; gap: var(--space-4); }
  @container (min-width: 42rem) { .psalter-columns { grid-template-columns: repeat(3, 1fr); gap: var(--space-5); } }
  .psalter-card { padding: var(--space-4); background-color: var(--color-surface-raised); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
  .psalter-card[data-highlight="true"] { border-color: var(--color-accent); }
  .psalter-card h3 { text-transform: uppercase; letter-spacing: 0.07em; color: var(--color-text-secondary); }
  .psalter-resolved { font-family: var(--font-family-mono); font-size: var(--font-size-xs); color: var(--color-accent); margin-block: var(--space-2); }
  .psalter-text { font-family: var(--font-family-serif); font-size: var(--font-size-base); }

  .book-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(15rem, 100%), 1fr)); gap: var(--space-1) var(--space-4); }
  .book { display: grid; grid-template-columns: 2.25rem 1fr; gap: var(--space-2); align-items: baseline; padding-block: var(--space-1); font-size: var(--font-size-sm); }
  .book-position { font-family: var(--font-family-mono); font-size: var(--font-size-xs); color: var(--color-text-secondary); text-align: end; font-variant-numeric: tabular-nums; }
  .book[data-deuterocanon="true"] .book-name { color: var(--color-accent); }
  .legend { font-size: var(--font-size-xs); color: var(--color-text-secondary); }

  .error { color: var(--color-danger); font-size: var(--font-size-sm); max-inline-size: var(--measure-prose); }
  .error b { display: block; font-family: var(--font-family-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.06em; }

  .is-busy { opacity: 0.55; }
  @media (prefers-reduced-motion: no-preference) {
    .result { transition: opacity var(--duration-fast) var(--easing-standard); }
    .button, .control { transition: border-color var(--duration-fast) var(--easing-standard), background-color var(--duration-fast) var(--easing-standard); }
  }

  .skip-link { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip-path: inset(50%); }
  .skip-link:focus-visible { position: static; inline-size: auto; block-size: auto; clip-path: none; display: inline-block; margin: var(--space-3); padding: var(--space-2) var(--space-3); }
}
</style>
</head>
<body>
<a class="skip-link" href="#passages">Skip to the demo</a>

<header class="masthead">
  <div class="shell stack">
    <p class="eyebrow">Public domain &middot; American Standard Version, 1901</p>
    <h1>Canon-Aware Bible API</h1>
    <p class="lede">
      All 31,102 verses, compiled into a Cloudflare Worker. There is no database,
      so a request performs no I/O &mdash; a verse lookup is a string slice, and
      search runs over an index built at compile time.
    </p>
    <p class="status" id="status" data-state="checking">Checking the API&hellip;</p>
    <dl class="facts">
      <div><dt>Verses</dt><dd>31,102</dd></div>
      <div><dt>Canons</dt><dd>66 &middot; 73 &middot; 76</dd></div>
      <div><dt>Bundle</dt><dd>1.93 MB</dd></div>
      <div><dt>CPU / request</dt><dd>4 ms</dd></div>
    </dl>
  </div>
</header>

<main class="shell sections">

  <section class="stack" id="passages" aria-labelledby="h-passages">
    <h2 id="h-passages">Passages</h2>
    <p class="prose">
      References are parsed, not pattern-matched. Bounds come from the real
      versification, so <code>John 3:99</code> is refused with the length of the
      actual chapter, and an abbreviation that could mean several books is
      refused rather than guessed.
    </p>

    <form class="stack" id="passage-form" style="--flow-space: var(--space-4)">
      <div class="cluster controls">
        <div class="field" style="flex: 1 1 17rem">
          <label for="passage-ref">Reference</label>
          <input class="control" id="passage-ref" value="John 3:16" autocomplete="off" spellcheck="false" required>
        </div>
        <div class="field">
          <label for="passage-numbering">Numbering</label>
          <select class="control" id="passage-numbering">
            <option value="english">English</option>
            <option value="hebrew">Hebrew</option>
            <option value="greek">Greek</option>
          </select>
        </div>
        <button class="button" type="submit">Look up</button>
      </div>
      <div class="cluster examples">
        <span class="examples-label">Try</span>
        <button class="button button--quiet" type="button" data-ref="Genesis 1:1-2:3">Genesis 1:1-2:3</button>
        <button class="button button--quiet" type="button" data-ref="1 Cor 13:4-7,13">1 Cor 13:4-7,13</button>
        <button class="button button--quiet" type="button" data-ref="Jude 5">Jude 5</button>
        <button class="button button--quiet" type="button" data-ref="Matthew 17:21">Matthew 17:21</button>
        <button class="button button--quiet" type="button" data-ref="Psalm 23" data-numbering="hebrew">Psalm 23 (Hebrew)</button>
        <button class="button button--quiet" type="button" data-ref="Jo 3:16">Jo 3:16</button>
        <button class="button button--quiet" type="button" data-ref="John 3:99">John 3:99</button>
      </div>
    </form>

    <p class="request" id="passage-request"><code>&mdash;</code></p>
    <div class="result stack" id="passage-result" aria-live="polite" aria-busy="false"></div>
  </section>

  <section class="stack" aria-labelledby="h-search">
    <h2 id="h-search">Search</h2>
    <p class="prose">
      Every term must appear, so the count means what it says. Words match their
      whole family: <code>speak</code> also finds <em>spake</em>, and
      <code>say</code> finds <em>said</em> and <em>saith</em> &mdash; forms no
      prefix rule reaches, and among the most common words in this translation.
    </p>

    <form class="stack" id="search-form" style="--flow-space: var(--space-4)">
      <div class="cluster controls">
        <div class="field" style="flex: 1 1 17rem">
          <label for="search-q">Query</label>
          <input class="control" id="search-q" value="good shepherd" autocomplete="off" spellcheck="false" minlength="2" required>
          <span class="field-hint">Two characters or more. The last word also matches by prefix.</span>
        </div>
        <button class="button" type="submit">Search</button>
      </div>
      <div class="cluster examples">
        <span class="examples-label">Try</span>
        <button class="button button--quiet" type="button" data-q="speak">speak</button>
        <button class="button button--quiet" type="button" data-q="say">say</button>
        <button class="button button--quiet" type="button" data-q="faith hope love">faith hope love</button>
        <button class="button button--quiet" type="button" data-q="believet">believet</button>
        <button class="button button--quiet" type="button" data-q="Jehovah">Jehovah</button>
        <button class="button button--quiet" type="button" data-q="the">the</button>
      </div>
    </form>

    <p class="request" id="search-request"><code>&mdash;</code></p>
    <div class="result stack" id="search-result" aria-live="polite" aria-busy="false"></div>
  </section>

  <section class="stack psalter" aria-labelledby="h-psalter">
    <h2 id="h-psalter">The two Psalters</h2>
    <p class="prose">
      Catholic and Orthodox sources number the Psalms as the Septuagint and
      Vulgate do, which is not how this translation numbers them. The divergence
      is not a constant offset: two psalms merge and two split. Ask for the same
      reference three ways and watch where each one lands.
    </p>

    <form class="stack" id="psalter-form" style="--flow-space: var(--space-4)">
      <div class="cluster controls">
        <div class="field">
          <label for="psalter-psalm">Psalm</label>
          <input class="control" id="psalter-psalm" type="number" min="1" max="150" value="50" style="inline-size: 6rem">
        </div>
        <div class="field">
          <label for="psalter-verse">Verse</label>
          <input class="control" id="psalter-verse" type="number" min="1" max="176" value="1" style="inline-size: 6rem">
        </div>
        <button class="button" type="submit">Resolve</button>
      </div>
      <div class="cluster examples">
        <span class="examples-label">Try</span>
        <button class="button button--quiet" type="button" data-psalm="50" data-verse="1">50:1 the Miserere</button>
        <button class="button button--quiet" type="button" data-psalm="9" data-verse="22">9:22 inside the merge</button>
        <button class="button button--quiet" type="button" data-psalm="115" data-verse="1">115:1 the Credidi</button>
        <button class="button button--quiet" type="button" data-psalm="23" data-verse="1">23:1</button>
      </div>
    </form>

    <div class="result stack" id="psalter-result" aria-live="polite" aria-busy="false"></div>
  </section>

  <section class="stack" aria-labelledby="h-canon">
    <h2 id="h-canon">The canons</h2>
    <p class="prose">
      A book's place depends on whose Bible you mean, and order differs as much
      as contents. Catholic Bibles follow the Vulgate; Greek Bibles follow the
      Septuagint, where the Minor Prophets come <em>before</em> Isaiah. The ASV
      carries no deuterocanonical text, so those books have canon positions and
      metadata but no verses.
    </p>

    <form class="stack" id="canon-form" style="--flow-space: var(--space-4)">
      <div class="cluster controls">
        <div class="field">
          <label for="canon-tradition">Tradition</label>
          <select class="control" id="canon-tradition">
            <option value="protestant">Protestant &mdash; 66</option>
            <option value="catholic">Catholic &mdash; 73</option>
            <option value="orthodox_greek">Orthodox Greek &mdash; 76</option>
          </select>
        </div>
      </div>
    </form>

    <p class="request" id="canon-request"><code>&mdash;</code></p>
    <div class="result stack" id="canon-result" aria-live="polite" aria-busy="false"></div>
  </section>

</main>

<footer class="site-footer">
  <div class="shell stack" style="--flow-space: var(--space-3)">
    <p class="prose">
      Text from <a href="https://ebible.org/Scriptures/eng-asv_usfx.zip">ebible.org</a>,
      the USFX edition of the American Standard Version (1901). Public domain.
    </p>
    <p class="prose">
      The divine name is preserved as the ASV printed it: Jehovah, 6,887 times.
      Sixteen verses are empty by design &mdash; the translators judged them
      absent from the earliest manuscripts, and each carries the note saying so.
    </p>
  </div>
</footer>

<script>
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function clear(node) { while (node.firstChild) { node.removeChild(node.firstChild); } }

  function make(tag, className, text) {
    var node = document.createElement(tag);
    if (className) { node.className = className; }
    if (text !== undefined && text !== null) { node.textContent = String(text); }
    return node;
  }

  function showRequest(target, path, outcome) {
    clear(target);
    target.appendChild(make("span", null, "GET"));
    target.appendChild(make("code", null, path));
    if (outcome) {
      target.dataset.status = outcome.ok ? "ok" : "error";
      target.appendChild(make("span", "meta", outcome.status + " \\u00b7 " + outcome.ms + " ms"));
    } else {
      delete target.dataset.status;
    }
  }

  function busy(region, state) {
    region.setAttribute("aria-busy", state ? "true" : "false");
    region.classList.toggle("is-busy", Boolean(state));
  }

  function call(path) {
    var started = performance.now();
    return fetch(path, { headers: { accept: "application/json" } }).then(function (response) {
      return response.json().then(function (body) {
        return { ok: response.ok, status: response.status, ms: Math.round(performance.now() - started), body: body };
      });
    });
  }

  function showError(region, outcome) {
    clear(region);
    var box = make("p", "error");
    box.setAttribute("role", "alert");
    box.appendChild(make("b", null, String(outcome.status) + " " + (outcome.body.error || "error")));
    box.appendChild(document.createTextNode(outcome.body.detail || "The request failed."));
    region.appendChild(box);
  }

  /* Passages ------------------------------------------------------------- */

  var passageForm = el("passage-form");
  var passageRef = el("passage-ref");
  var passageNumbering = el("passage-numbering");
  var passageRequest = el("passage-request");
  var passageResult = el("passage-result");

  function renderVerses(region, data) {
    clear(region);
    region.appendChild(make("p", "result-heading", data.reference));

    var list = make("ol", "verses stack");
    data.verses.forEach(function (verse) {
      var item = make("li", "verse");
      var omitted = verse.text === "";
      item.dataset.kind = verse.verse === 0 ? "title" : (omitted ? "omitted" : "verse");
      item.appendChild(make("span", "verse-number", verse.verse === 0 ? "title" : verse.verse));

      var body = make("div");
      body.appendChild(make("p", "verse-text", omitted ? "Not present in the ASV." : verse.text));
      if (verse.note) {
        var note = make("p", "note");
        note.appendChild(make("b", null, "Why: "));
        note.appendChild(document.createTextNode(verse.note));
        body.appendChild(note);
      }
      item.appendChild(body);
      list.appendChild(item);
    });
    region.appendChild(list);

    var count = data.verses.length;
    region.appendChild(make("p", "summary", count + (count === 1 ? " verse" : " verses") + " \\u00b7 " + data.numbering + " numbering"));
  }

  function loadPassage() {
    var ref = passageRef.value.trim();
    if (!ref) { return; }
    var path = "/passages?ref=" + encodeURIComponent(ref);
    if (passageNumbering.value !== "english") { path += "&numbering=" + passageNumbering.value; }

    showRequest(passageRequest, path, null);
    busy(passageResult, true);
    call(path).then(function (outcome) {
      busy(passageResult, false);
      showRequest(passageRequest, path, outcome);
      if (outcome.ok) { renderVerses(passageResult, outcome.body); } else { showError(passageResult, outcome); }
    });
  }

  passageForm.addEventListener("submit", function (event) { event.preventDefault(); loadPassage(); });
  passageForm.addEventListener("click", function (event) {
    var button = event.target.closest("[data-ref]");
    if (!button) { return; }
    passageRef.value = button.dataset.ref;
    passageNumbering.value = button.dataset.numbering || "english";
    loadPassage();
  });

  /* Search --------------------------------------------------------------- */

  var searchForm = el("search-form");
  var searchInput = el("search-q");
  var searchRequest = el("search-request");
  var searchResult = el("search-result");

  function highlight(text, stems) {
    var fragment = document.createDocumentFragment();
    if (!stems.length) { fragment.appendChild(document.createTextNode(text)); return fragment; }
    var pattern = new RegExp("(" + stems.join("|") + ")", "gi");
    var cursor = 0;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > cursor) { fragment.appendChild(document.createTextNode(text.slice(cursor, match.index))); }
      fragment.appendChild(make("mark", null, match[0]));
      cursor = match.index + match[0].length;
      if (pattern.lastIndex === match.index) { pattern.lastIndex += 1; }
    }
    if (cursor < text.length) { fragment.appendChild(document.createTextNode(text.slice(cursor))); }
    return fragment;
  }

  function renderHits(region, data) {
    clear(region);

    var summary = make("p", "summary");
    summary.appendChild(make("b", null, data.total.toLocaleString()));
    summary.appendChild(document.createTextNode((data.total === 1 ? " verse contains" : " verses contain") + " every term"));
    if (data.truncated) {
      summary.appendChild(document.createTextNode(" \\u00b7 a word this common is scanned only to the budget, so the count is a lower bound"));
    }
    region.appendChild(summary);

    if (!data.results.length) {
      region.appendChild(make("p", "prose", "Nothing in the ASV contains every term."));
      return;
    }

    /* Highlight short stems, so family matches ("spake" for "speak") show. */
    var stems = data.query.toLowerCase().split(/[^a-z']+/).filter(function (term) {
      return term.length >= 2;
    }).map(function (term) {
      return term.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&").slice(0, 4);
    });

    var list = make("ol", "hits stack");
    data.results.forEach(function (hit) {
      var item = make("li", "hit");
      item.appendChild(make("p", "hit-ref", hit.id));
      var text = make("p", "hit-text");
      text.appendChild(highlight(hit.text, stems));
      item.appendChild(text);
      list.appendChild(item);
    });
    region.appendChild(list);
  }

  function loadSearch() {
    var q = searchInput.value.trim();
    if (q.length < 2) { return; }
    var path = "/search?q=" + encodeURIComponent(q) + "&limit=8";
    showRequest(searchRequest, path, null);
    busy(searchResult, true);
    call(path).then(function (outcome) {
      busy(searchResult, false);
      showRequest(searchRequest, path, outcome);
      if (outcome.ok) { renderHits(searchResult, outcome.body); } else { showError(searchResult, outcome); }
    });
  }

  searchForm.addEventListener("submit", function (event) { event.preventDefault(); loadSearch(); });
  searchForm.addEventListener("click", function (event) {
    var button = event.target.closest("[data-q]");
    if (!button) { return; }
    searchInput.value = button.dataset.q;
    loadSearch();
  });

  /* Psalter -------------------------------------------------------------- */

  var psalterForm = el("psalter-form");
  var psalterPsalm = el("psalter-psalm");
  var psalterVerse = el("psalter-verse");
  var psalterResult = el("psalter-result");

  var SCHEMES = [
    { key: "english", label: "English", note: "As the ASV prints it." },
    { key: "hebrew", label: "Hebrew", note: "The superscription is verse 1." },
    { key: "greek", label: "Greek", note: "Septuagint and Vulgate." }
  ];

  function loadPsalter() {
    var psalm = Number(psalterPsalm.value);
    var verse = Number(psalterVerse.value);
    if (!psalm || !verse) { return; }
    var ref = "Psalm " + psalm + ":" + verse;

    busy(psalterResult, true);
    Promise.all(SCHEMES.map(function (scheme) {
      return call("/passages?ref=" + encodeURIComponent(ref) + "&numbering=" + scheme.key);
    })).then(function (outcomes) {
      busy(psalterResult, false);
      clear(psalterResult);
      psalterResult.appendChild(make("p", "result-heading", "Psalm " + psalm + ":" + verse + ", read three ways"));

      var columns = make("div", "psalter-columns");
      outcomes.forEach(function (outcome, index) {
        var scheme = SCHEMES[index];
        var card = make("div", "psalter-card");
        if (scheme.key === "greek") { card.dataset.highlight = "true"; }
        card.appendChild(make("h3", null, scheme.label));

        if (!outcome.ok) {
          card.appendChild(make("p", "psalter-resolved", String(outcome.status)));
          card.appendChild(make("p", "psalter-text", outcome.body.detail || "Not available."));
        } else {
          var first = outcome.body.verses[0];
          card.appendChild(make("p", "psalter-resolved", first ? first.id : outcome.body.reference));
          card.appendChild(make("p", "psalter-text", first ? (first.text || "\\u2014") : "\\u2014"));
        }
        card.appendChild(make("p", "field-hint", scheme.note));
        columns.appendChild(card);
      });
      psalterResult.appendChild(columns);
    });
  }

  psalterForm.addEventListener("submit", function (event) { event.preventDefault(); loadPsalter(); });
  psalterForm.addEventListener("click", function (event) {
    var button = event.target.closest("[data-psalm]");
    if (!button) { return; }
    psalterPsalm.value = button.dataset.psalm;
    psalterVerse.value = button.dataset.verse;
    loadPsalter();
  });

  /* Canon ---------------------------------------------------------------- */

  var canonTradition = el("canon-tradition");
  var canonRequest = el("canon-request");
  var canonResult = el("canon-result");

  function renderBooks(region, data) {
    clear(region);
    var list = make("ol", "book-list");
    data.books.forEach(function (book, index) {
      var item = make("li", "book");
      item.dataset.deuterocanon = String(book.is_deuterocanon);
      item.appendChild(make("span", "book-position", index + 1));
      var name = make("span", "book-name", book.name);
      if (book.is_deuterocanon) { name.title = "Deuterocanonical \\u2014 metadata only, no text in the ASV"; }
      item.appendChild(name);
      list.appendChild(item);
    });
    region.appendChild(list);

    var deuteros = data.books.filter(function (book) { return book.is_deuterocanon; }).length;
    var legend = make("p", "legend", deuteros
      ? data.books.length + " books \\u00b7 " + deuteros + " deuterocanonical, shown in the accent colour \\u2014 canon position and metadata only, since the ASV carries no text for them"
      : data.books.length + " books");
    region.appendChild(legend);
  }

  function loadCanon() {
    var path = "/books?tradition=" + canonTradition.value;
    showRequest(canonRequest, path, null);
    busy(canonResult, true);
    call(path).then(function (outcome) {
      busy(canonResult, false);
      showRequest(canonRequest, path, outcome);
      if (outcome.ok) { renderBooks(canonResult, outcome.body); } else { showError(canonResult, outcome); }
    });
  }

  canonTradition.addEventListener("change", loadCanon);

  /* Status --------------------------------------------------------------- */

  var status = el("status");
  call("/health").then(function (outcome) {
    if (outcome.ok && outcome.body.status === "ok") {
      status.dataset.state = "ok";
      status.textContent = "Live \\u00b7 responded in " + outcome.ms + " ms \\u00b7 corpus embedded, no database";
    } else {
      status.dataset.state = "down";
      status.textContent = "The API did not respond as expected.";
    }
  })["catch"](function () {
    status.dataset.state = "down";
    status.textContent = "The API could not be reached.";
  });

  loadPassage();
  loadSearch();
  loadPsalter();
  loadCanon();
})();
</script>
</body>
</html>`;
