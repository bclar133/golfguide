import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const courseFile = path.join(root, "courses.js");
const reportDir = path.join(root, "course-media-reports");
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const args = parseArgs(process.argv.slice(2));
const writeChanges = Boolean(args.write);
const force = Boolean(args.force);
const limit = args.limit ? Number(args.limit) : 0;
const only = args.only ? String(args.only).toLowerCase() : "";
const timeoutMs = args.timeout ? Number(args.timeout) : 16000;

fs.mkdirSync(reportDir, { recursive: true });

const parsed = readCourses();
const courses = parsed.courses;
const selectedCourses = courses.filter(shouldProcess).slice(0, limit || undefined);
const report = [];
let updated = 0;

for (const course of selectedCourses) {
  const result = await enrichCourseWebsite(course);
  report.push(result);
  if (result.updated) updated += 1;
}

if (writeChanges && updated > 0) {
  fs.writeFileSync(courseFile, parsed.prefix + JSON.stringify(courses, null, 2) + ";\n", "utf8");
}

const reportPath = path.join(reportDir, "website-enrichment-" + timestamp() + ".json");
fs.writeFileSync(reportPath, JSON.stringify({ processed: selectedCourses.length, updated, writeChanges, report }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ processed: selectedCourses.length, updated, writeChanges, reportPath }, null, 2));

function parseArgs(raw) {
  const parsed = {};
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "write" || key === "force") {
      parsed[key] = true;
    } else {
      parsed[key] = raw[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function readCourses() {
  const text = fs.readFileSync(courseFile, "utf8");
  const match = text.match(/^([\s\S]*?window\.GOLF_COURSES\s*=\s*)(\[[\s\S]*\]);?\s*$/);
  if (!match) throw new Error("Could not parse courses.js");
  return { prefix: match[1], courses: JSON.parse(match[2]) };
}

function shouldProcess(course) {
  if (only) {
    const haystack = String(course.id + " " + course.name + " " + course.town + " " + course.region + " " + course.state).toLowerCase();
    if (!haystack.includes(only)) return false;
  }
  if (force) return true;
  return !course.homepageUrl;
}

async function enrichCourseWebsite(course) {
  const result = { id: course.id, name: course.name, town: course.town, state: course.state, status: "pending", updated: false };
  try {
    const query = `${course.name} ${course.town || course.region || ""} ${course.state} golf club website`;
    const results = await searchDuckDuckGo(query);
    const candidates = results
      .map((searchResult) => ({ ...searchResult, score: scoreSearchResult(searchResult, course) }))
      .filter((searchResult) => searchResult.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);

    result.query = query;
    result.candidates = candidates.map((candidate) => ({ title: candidate.title, url: candidate.url, score: candidate.score }));

    for (const candidate of candidates) {
      const verified = await verifyCandidate(candidate, course);
      if (!verified.ok) {
        candidate.verifyReason = verified.reason;
        continue;
      }

      if (writeChanges) {
        course.homepageUrl = candidate.url;
        course.webSearchUrl = webSearchUrl(course.name, course.town || course.region || course.state, course.state);
      }
      Object.assign(result, {
        status: "found",
        updated: true,
        homepageUrl: candidate.url,
        title: candidate.title,
        score: candidate.score,
        verifyReason: verified.reason
      });
      return result;
    }

    result.status = candidates.length ? "no-verified-result" : "no-candidates";
    return result;
  } catch (error) {
    result.status = "error";
    result.error = String(error && error.message ? error.message : error);
    return result;
  }
}

async function searchDuckDuckGo(query) {
  const url = "https://duckduckgo.com/html/?kl=au-en&q=" + encodeURIComponent(query);
  const html = await fetchText(url, "text/html,application/xhtml+xml");
  if (/anomaly-modal|bots use DuckDuckGo|challenge-form/i.test(html)) {
    throw new Error("DuckDuckGo challenge page returned");
  }
  const results = [];
  for (const link of html.matchAll(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const nearbyBefore = html.slice(Math.max(0, link.index - 900), link.index);
    const nearbyAfter = html.slice(link.index, link.index + 3200);
    if (/result--ad|badge--ad/i.test(nearbyBefore)) continue;
    const url = unwrapDuckUrl(decodeHtml(link[1]));
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const title = stripTags(decodeHtml(link[2]));
    const snippetMatch = nearbyAfter.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/i);
    const snippet = snippetMatch ? stripTags(decodeHtml(snippetMatch[1])) : "";
    results.push({ title, url, snippet });
  }
  return results;
}

function unwrapDuckUrl(value) {
  try {
    const withProtocol = value.startsWith("//") ? "https:" + value : value;
    const url = new URL(withProtocol);
    const wrapped = url.searchParams.get("uddg");
    return wrapped ? decodeURIComponent(wrapped) : withProtocol;
  } catch {
    return "";
  }
}

function scoreSearchResult(result, course) {
  const title = normalise(result.title);
  const snippet = normalise(result.snippet);
  const combined = title + " " + snippet;
  let score = 0;
  const tokens = courseTokens(course);
  const name = normalise(course.name);
  const town = normalise(course.town);
  let host = "";
  let pathValue = "";
  try {
    const url = new URL(result.url);
    host = normalise(url.hostname.replace(/^www\./, ""));
    pathValue = normalise(url.pathname);
  } catch {
    return 0;
  }

  if (title.includes(name)) score += 70;
  if (combined.includes(name)) score += 45;
  if (town && combined.includes(town)) score += 12;
  for (const token of tokens) {
    if (combined.includes(token)) score += 8;
    if (host.includes(token) || pathValue.includes(token)) score += 8;
  }
  if (/golf/.test(host)) score += 16;
  if (/club|course|links|resort/.test(host + " " + pathValue)) score += 8;
  if (tokens.some((token) => host.includes(token)) && /golf/.test(host)) score += 36;
  if (pathValue.length <= 1 && tokens.some((token) => host.includes(token))) score += 14;
  if (/\.(com\.au|org\.au|net\.au|golf|club)$/.test(host)) score += 8;
  if (/facebook\.com|1golf\.com\.au|miClub|miclub|bookatee|golfbox/i.test(result.url)) score += 4;
  if (/gov\.au|council|qld\.gov|nsw\.gov|vic\.gov|sa\.gov|wa\.gov|tas\.gov|nt\.gov|act\.gov/i.test(result.url)) score += 6;
  if (/tripadvisor|top100|golffinder|findglocal|superpages|yellowpages|australia247|truelocal|golf\.org\.au|golf\.com\.au|queensland\.com|brisbanegolfcourses|chronogolf|bluegolf|whereis|clubsandpubsnearme|schoolandcollegelistings|playsport|visit|tourism/i.test(result.url)) score -= 55;
  if (/directory|review|reviews|things-to-do|attractions/i.test(result.url)) score -= 18;
  return score;
}

async function verifyCandidate(candidate, course) {
  try {
    const html = await fetchText(candidate.url, "text/html,application/xhtml+xml,*/*;q=0.8");
    if (isDeadPage(html)) return { ok: false, reason: "dead-page" };
    const text = normalise(stripTags(html).slice(0, 25000));
    const tokens = courseTokens(course);
    const matched = tokens.filter((token) => text.includes(token));
    const host = normalise(new URL(candidate.url).hostname);
    if (tokens.some((token) => host.includes(token)) && /golf/.test(host)) return { ok: true, reason: "matched-host" };
    if (!text.includes("golf")) return { ok: false, reason: "no-golf-text" };
    if (matched.length >= Math.min(2, tokens.length)) return { ok: true, reason: "matched-page-text" };
    return { ok: false, reason: "weak-token-match" };
  } catch {
    try {
      const host = normalise(new URL(candidate.url).hostname);
      const tokens = courseTokens(course);
      if (tokens.some((token) => host.includes(token)) && /golf/.test(host)) return { ok: true, reason: "host-match-fetch-failed" };
    } catch {}
    return { ok: false, reason: "fetch-failed" };
  }
}

async function fetchText(url, accept) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": userAgent, accept }
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
  return response.text();
}

function courseTokens(course) {
  return unique(String(course.name + " " + course.town).toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/))
    .filter((token) => token.length >= 4)
    .filter((token) => !["golf", "club", "course", "country", "community", "public", "resort", "links", "bowls", "driving", "range", "mini", "putt"].includes(token));
}

function unique(values) {
  return Array.from(new Set(values));
}

function isDeadPage(html) {
  return /main-frame-error|DNS_PROBE|ERR_[A-Z_]+|web server is down|website is currently unavailable|may be for sale|buy this domain|domain parking|parked domain|access denied|forbidden|not found/i.test(String(html || "").slice(0, 25000));
}

function stripTags(value) {
  return String(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalise(value) {
  return String(value || "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
}

function decodeHtml(value) {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function webSearchUrl(name, town, state) {
  return "https://www.google.com/search?q=" + encodeURIComponent(`${name} ${town} ${state} golf club website`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
