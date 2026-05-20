import fs from "node:fs/promises";
import { appendFileSync } from "node:fs";
import path from "node:path";

const URL = "https://footjoyukshoefittingevents.as.me/schedule/aa876a03";
const STATE_DIR = ".monitor";
const STATE_FILE = path.join(STATE_DIR, "footjoy-events.json");

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractEvents(text) {
  // Looks for lines like:
  // "June 10th - Kilnwick Percy Golf Club - YO42 1UF"
  const monthGroup = MONTHS.join("|");
  const re = new RegExp(
    `(?:🏴\\s*)?(?:${monthGroup})\\s+\\d{1,2}(?:st|nd|rd|th)(?:\\s*&\\s*(?:${monthGroup})\\s+\\d{1,2}(?:st|nd|rd|th))?\\s*-\\s*[^-]{2,120}\\s*-\\s*[A-Z]{1,2}\\d[A-Z\\d]?\\s*\\d[A-Z]{2}`,
    "gi"
  );

  const rawMatches = text.match(re) || [];
  const cleaned = rawMatches
    .map((s) => s.replace(/\s+/g, " ").trim())
    .map((s) => s.replace(/^🏴\s*/, ""));

  // unique + stable order
  return [...new Set(cleaned)].sort((a, b) => a.localeCompare(b, "en-GB"));
}

async function readPrevious() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

async function saveState(events) {
  await fs.mkdir(STATE_DIR, { recursive: true });
  const payload = {
    updatedAt: new Date().toISOString(),
    source: URL,
    events
  };
  await fs.writeFile(STATE_FILE, JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function setOutput(name, value) {
  const outPath = process.env.GITHUB_OUTPUT;
  if (!outPath) return;
  const text = String(value ?? "");
  const block = `${name}<<EOF\n${text}\nEOF\n`;
  appendFileSync(outPath, block);
}

// Scottish postcode area prefixes. TD straddles the border but is
// predominantly Scottish, so we treat all TD as Scotland for simplicity.
const SCOTTISH_PREFIXES = new Set([
  "AB","DD","DG","EH","FK","G","HS","IV","KA","KW","KY","ML","PA","PH","TD","ZE"
]);

function isScottishEvent(event) {
  const m = event.match(/\b([A-Z]{1,2})\d[A-Z\d]?\s*\d[A-Z]{2}\b/);
  return !!m && SCOTTISH_PREFIXES.has(m[1]);
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      // Use a realistic browser UA: Acuity Scheduling returns a stripped
      // page (no events) when it sees an obvious bot UA from cloud IPs.
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif," +
        "image/webp,image/apng,*/*;q=0.8",
      "accept-language": "en-GB,en;q=0.9",
      "cache-control": "no-cache",
      pragma: "no-cache"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  const text = stripTags(html);
  const currentEvents = extractEvents(text);

  if (currentEvents.length === 0) {
    console.error("=== Parse diagnostics ===");
    console.error(`HTTP status:       ${res.status}`);
    console.error(`Raw HTML length:   ${html.length}`);
    console.error(`Stripped length:   ${text.length}`);
    console.error(`First 800 chars of stripped text:`);
    console.error(text.slice(0, 800));
    throw new Error("No events parsed. Page structure may have changed.");
  }

  const previousEvents = await readPrevious();
  const previousSet = new Set(previousEvents);

  const newEvents = currentEvents.filter((e) => !previousSet.has(e));

  // Always refresh state so removals/edits are tracked too
  await saveState(currentEvents);

  // First run: initialize baseline, no alert
  const firstRun = previousEvents.length === 0;
  const changed = !firstRun && newEvents.length > 0;

  const newScotlandEvents = newEvents.filter(isScottishEvent);
  const hasScotland = changed && newScotlandEvents.length > 0;

  const flag = hasScotland ? "\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74\uDB40\uDC7F " : "";
  const subject = changed
    ? `${flag}FootJoy monitor: ${newEvents.length} new event(s)${hasScotland ? ` (${newScotlandEvents.length} Scottish)` : ""}`
    : "FootJoy monitor: no new events";

  setOutput("changed", changed ? "true" : "false");
  setOutput("new_count", String(newEvents.length));
  setOutput("subject", subject);
  setOutput("new_events", newEvents.join("\n"));
  setOutput("has_scotland", hasScotland ? "true" : "false");
  setOutput("scotland_count", String(newScotlandEvents.length));
  setOutput("scotland_events", newScotlandEvents.join("\n"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});