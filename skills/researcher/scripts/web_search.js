import { createInterface } from "readline";

const chunks = [];
const rl = createInterface({ input: process.stdin });
rl.on("line", (line) => chunks.push(line));
rl.on("close", async () => {
  const input = JSON.parse(chunks.join("\n") || "{}");
  const { query = "", maxResults = 8 } = input;

  try {
    const url = "https://html.duckduckgo.com/html/?" + new URLSearchParams({ q: query });
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Zerohand-Research/1.0)",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const html = await res.text();
    const items = [];
    const resultPattern =
      /class="result__title"[^>]*>.*?<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>.*?class="result__snippet"[^>]*>(.*?)<\/span>/gs;
    const stripTags = (s) =>
      s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').trim();
    let match;
    while ((match = resultPattern.exec(html)) !== null && items.length < maxResults) {
      let [, href, titleHtml, snippetHtml] = match;
      if (href.startsWith("//duckduckgo.com/l/?")) {
        const uddg = href.match(/uddg=([^&]+)/);
        if (uddg) href = decodeURIComponent(uddg[1]);
      }
      if (href.startsWith("//")) href = "https:" + href;
      items.push({ title: stripTags(titleHtml), url: href, snippet: stripTags(snippetHtml) });
    }
    if (items.length === 0) {
      items.push({ title: "No results", url: "", snippet: `No web results found for: ${query}` });
    }
    console.log(JSON.stringify(items, null, 2));
  } catch (err) {
    console.log(JSON.stringify([{ title: "Error", url: "", snippet: String(err) }]));
  }
});
