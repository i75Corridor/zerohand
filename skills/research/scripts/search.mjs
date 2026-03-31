#!/usr/bin/env node
/**
 * DuckDuckGo HTML search scraper.
 * Usage: node search.mjs "<query>" [--max=N]
 *
 * Prints a JSON array of { title, url, snippet } objects to stdout.
 */

const query = process.argv[2];
const maxArg = process.argv.find(a => a.startsWith("--max="));
const max = maxArg ? parseInt(maxArg.slice(6)) : 8;

if (!query) {
  console.error("Usage: node search.mjs \"<query>\" [--max=N]");
  process.exit(1);
}

const url = "https://html.duckduckgo.com/html/?" + new URLSearchParams({ q: query });

const res = await fetch(url, {
  headers: {
    "User-Agent": "Mozilla/5.0 (compatible; ZeroClaw-Research/1.0)",
    "Accept-Language": "en-US,en;q=0.9",
  },
});

const html = await res.text();

// Extract result blocks: each result has a title, URL, and snippet
const results = [];
const resultPattern = /class="result__title"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>.*?class="result__snippet"[^>]*>(.*?)<\/span>/gs;

let match;
while ((match = resultPattern.exec(html)) !== null && results.length < max) {
  let [, href, titleHtml, snippetHtml] = match;

  // Decode DDG redirect URLs
  if (href.startsWith("//duckduckgo.com/l/?")) {
    const uddg = href.match(/uddg=([^&]+)/);
    if (uddg) href = decodeURIComponent(uddg[1]);
  }
  if (href.startsWith("//")) href = "https:" + href;

  const stripTags = s => s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();

  results.push({
    title: stripTags(titleHtml),
    url: href,
    snippet: stripTags(snippetHtml),
  });
}

if (results.length === 0) {
  console.log(JSON.stringify([{ title: "No results", url: "", snippet: `No web results found for: ${query}` }]));
} else {
  console.log(JSON.stringify(results, null, 2));
}
