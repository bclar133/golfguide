import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const courseFile = path.join(root, "courses.js");
const reportDir = path.join(root, "course-media-reports");
const directoryUrl = "https://www.golfnsw.org.au/nsw-and-act-golf-clubs/";
const userAgent = "AussieGolfGuide/1.0 (official directory enrichment)";

const args = parseArgs(process.argv.slice(2));
const writeChanges = Boolean(args.write);
const limit = args.limit ? Number(args.limit) : 0;
const only = args.only ? String(args.only).toLowerCase() : "";
const timeoutMs = args.timeout ? Number(args.timeout) : 25000;

fs.mkdirSync(reportDir, { recursive: true });

const parsed = readCourses();
const courses = parsed.courses;
const targetCourses = courses.filter((course) => ["NSW", "ACT"].includes(course.state) && (!course.homepageUrl || args.force));
const directoryEntries = await fetchDirectoryEntries();
const report = [];
let updated = 0;
let processed = 0;

for (const entry of directoryEntries) {
  if (limit && processed >= limit) break;
  if (only && !String(entry.name + " " + entry.url).toLowerCase().includes(only)) continue;
  processed += 1;
  const profile = await fetchClubProfile(entry);
  const row = {
    sourceName: entry.name,
    sourceUrl: entry.url,
    status: "pending",
    updated: false,
    website: profile.website || "",
    profileStatus: profile.status
  };
  if (!profile.website) {
    row.status = "missing-website-on-profile";
    report.push(row);
    continue;
  }
  const match = bestCourseMatch(entry.name, targetCourses);
  row.match = match ? { id: match.course.id, name: match.course.name, state: match.course.state, score: match.score, reason: match.reason } : null;
  if (!match || match.score < 92) {
    row.status = "needs-review";
    report.push(row);
    continue;
  }
  row.status = "matched";
  row.updated = !match.course.homepageUrl || match.course.homepageUrl !== profile.website;
  if (writeChanges && row.updated) {
    match.course.homepageUrl = profile.website;
    match.course.webSearchUrl = webSearchUrl(match.course.name, match.course.town || match.course.region || match.course.state, match.course.state);
  }
  if (row.updated) updated += 1;
  report.push(row);
}

if (writeChanges && updated > 0) {
  fs.writeFileSync(courseFile, parsed.prefix + JSON.stringify(courses, null, 2) + ";\n", "utf8");
}

const reportPath = path.join(reportDir, "golfnsw-website-enrichment-" + timestamp() + ".json");
fs.writeFileSync(reportPath, JSON.stringify({ processed, updated, writeChanges, directoryUrl, report }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ processed, updated, writeChanges, reportPath }, null, 2));

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

async function fetchDirectoryEntries() {
  const html = await fetchText(directoryUrl);
  const entries = [];
  const seen = new Set();
  for (const link of html.matchAll(/<a\b[^>]*href=["']([^"']*\/golf-clubs\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = new URL(decodeHtml(link[1]), directoryUrl).href;
    if (seen.has(url)) continue;
    seen.add(url);
    const name = cleanName(stripTags(decodeHtml(link[2])));
    if (!name || /^image:/i.test(name)) continue;
    entries.push({ name, url });
  }
  return entries;
}

async function fetchClubProfile(entry) {
  try {
    const html = await fetchText(entry.url);
    if (isBlockedPage(html)) return { status: "blocked", website: "" };
    const contactSlice = sliceBetween(html, /Contact Info/i, /<h2|<h3|<h4|Scorecard|Gallery|Golf NSW Strategic/i) || html;
    const links = Array.from(contactSlice.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))
      .map((match) => ({ url: new URL(decodeHtml(match[1]), entry.url).href, text: cleanName(stripTags(decodeHtml(match[2]))) }))
      .filter((link) => /^https?:\/\//i.test(link.url));
    const website = bestProfileWebsite(links, entry);
    return { status: "ok", website };
  } catch (error) {
    return { status: "error: " + String(error && error.message ? error.message : error), website: "" };
  }
}

function isBlockedPage(html) {
  return /sgcaptcha|captcha|checking the site connection security|verify you are human|requires cookies/i.test(String(html || "").slice(0, 5000));
}

function bestProfileWebsite(links, entry) {
  const sourceHost = new URL(directoryUrl).hostname.replace(/^www\./, "");
  const blocked = /golfnsw\.org\.au|visitnsw\.com|facebook\.com|instagram\.com|twitter\.com|linkedin\.com|youtube\.com|google\.com|list-manage\.com|unlimited-elements\.com/i;
  const entryTokens = tokens(entry.name);
  let best = null;
  for (const link of links) {
    const parsed = new URL(link.url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (host === sourceHost || blocked.test(host)) continue;
    let score = 0;
    const haystack = normalise(host + " " + parsed.pathname + " " + link.text);
    for (const token of entryTokens) {
      if (haystack.includes(token)) score += 18;
    }
    if (/golf|club|country|links|course/.test(haystack)) score += 25;
    if (link.text.includes(".") || /^www\./i.test(link.text)) score += 20;
    if (score >= 25 && (!best || score > best.score)) best = { url: link.url, score };
  }
  return best ? best.url : "";
}

function bestCourseMatch(sourceName, candidateCourses) {
  const sourceKey = matchKey(sourceName);
  const sourceTokens = tokens(sourceName);
  let best = null;
  for (const course of candidateCourses) {
    const courseKey = matchKey(course.name);
    const courseTokens = tokens(course.name + " " + course.town);
    let score = 0;
    let reason = "";
    if (sourceKey && sourceKey === courseKey) {
      score = 120;
      reason = "normalised-name";
    } else {
      const overlap = sourceTokens.filter((token) => courseTokens.includes(token));
      const coverage = overlap.length / Math.max(1, sourceTokens.length);
      score = Math.round(overlap.length * 22 + coverage * 45);
      reason = "token-overlap";
      if (normalise(course.name).includes(normalise(sourceName)) || normalise(sourceName).includes(normalise(course.name))) {
        score += 25;
        reason = "name-contains";
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { course, score, reason };
  }
  return best;
}

function matchKey(value) {
  return normalise(value)
    .replace(/\b(golf|club|course|country|links|public|social|sports|sporting|and|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml,*/*;q=0.8" }
  });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
  return response.text();
}

function sliceBetween(value, startPattern, endPattern) {
  const start = value.search(startPattern);
  if (start < 0) return "";
  const rest = value.slice(start);
  const end = rest.search(endPattern);
  return end > 0 ? rest.slice(0, end) : rest;
}

function tokens(value) {
  return unique(normalise(value).split(/\s+/))
    .filter((token) => token.length >= 4)
    .filter((token) => !["golf", "club", "course", "country", "public", "links", "social", "sports", "sporting"].includes(token));
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function stripTags(value) {
  return String(value).replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function cleanName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
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
