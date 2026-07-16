import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const courseFile = path.join(root, "courses.js");
const reportDir = path.join(root, "course-media-reports");
const userAgent = "AussieGolfGuide/1.0 (course website enrichment)";

const args = parseArgs(process.argv.slice(2));
const writeChanges = Boolean(args.write);
const force = Boolean(args.force);
const limit = args.limit ? Number(args.limit) : 0;
const batchSize = Math.max(1, Math.min(100, args["batch-size"] ? Number(args["batch-size"]) : 50));
const only = args.only ? String(args.only).toLowerCase() : "";
const timeoutMs = args.timeout ? Number(args.timeout) : 30000;

fs.mkdirSync(reportDir, { recursive: true });

const parsed = readCourses();
const courses = parsed.courses;
const selectedCourses = courses.filter(shouldProcess).slice(0, limit || undefined);
const report = [];
let updated = 0;

const batches = groupByElementType(selectedCourses);
for (const [type, entries] of Object.entries(batches)) {
  for (let index = 0; index < entries.length; index += batchSize) {
    const chunk = entries.slice(index, index + batchSize);
    const result = await fetchOsmElements(type, chunk.map((entry) => entry.osmId));
    for (const entry of chunk) {
      const course = entry.course;
      const element = result.elements.get(String(entry.osmId));
      const row = {
        id: course.id,
        name: course.name,
        town: course.town,
        state: course.state,
        sourceId: course.sourceId,
        status: "pending",
        updated: false
      };
      if (!element) {
        row.status = result.error ? "fetch-error" : "missing-osm-element";
        if (result.error) row.error = result.error;
        report.push(row);
        continue;
      }
      const candidate = bestWebsiteTag(element.tags);
      row.tags = pickWebsiteTags(element.tags);
      if (!candidate) {
        row.status = "no-website-tag";
        report.push(row);
        continue;
      }
      const normalised = normaliseOnlinePresence(candidate.value, candidate.key);
      if (!normalised) {
        row.status = "invalid-url";
        row.rawUrl = candidate.value;
        report.push(row);
        continue;
      }
      const rejectionReason = rejectCandidateUrl(course, normalised);
      if (rejectionReason) {
        row.status = "rejected-url";
        row.homepageUrl = normalised;
        row.tag = candidate.key;
        row.reason = rejectionReason;
        report.push(row);
        continue;
      }
      row.status = "found";
      row.homepageUrl = normalised;
      row.tag = candidate.key;
      row.updated = !course.homepageUrl || course.homepageUrl !== normalised;
      if (writeChanges && row.updated) {
        course.homepageUrl = normalised;
        course.webSearchUrl = webSearchUrl(course.name, course.town || course.region || course.state, course.state);
      }
      if (row.updated) updated += 1;
      report.push(row);
    }
  }
}

if (writeChanges && updated > 0) {
  fs.writeFileSync(courseFile, parsed.prefix + JSON.stringify(courses, null, 2) + ";\n", "utf8");
}

const reportPath = path.join(reportDir, "osm-website-enrichment-" + timestamp() + ".json");
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
  if (!parseSourceId(course.sourceId)) return false;
  return force || !course.homepageUrl;
}

function parseSourceId(sourceId) {
  const match = String(sourceId || "").match(/^osm-(node|way|relation)-(\d+)$/);
  return match ? { type: match[1], osmId: match[2] } : null;
}

function groupByElementType(items) {
  const grouped = { node: [], way: [], relation: [] };
  for (const course of items) {
    const parsed = parseSourceId(course.sourceId);
    if (!parsed) continue;
    grouped[parsed.type].push({ course, osmId: parsed.osmId });
  }
  return grouped;
}

async function fetchOsmElements(type, ids) {
  const plural = type + "s";
  const url = "https://api.openstreetmap.org/api/0.6/" + plural + "?" + plural + "=" + ids.join(",");
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": userAgent, accept: "application/xml,text/xml,*/*" }
    });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const xml = await response.text();
    return { elements: parseOsmXml(xml) };
  } catch (error) {
    return { elements: new Map(), error: String(error && error.message ? error.message : error) };
  }
}

function parseOsmXml(xml) {
  const elements = new Map();
  for (const match of xml.matchAll(/<(node|way|relation)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
    const attrs = parseAttrs(match[2]);
    const body = match[3];
    const tags = {};
    for (const tag of body.matchAll(/<tag\b([^>]*)\/>/g)) {
      const tagAttrs = parseAttrs(tag[1]);
      if (tagAttrs.k) tags[tagAttrs.k] = tagAttrs.v || "";
    }
    if (attrs.id) elements.set(String(attrs.id), { type: match[1], id: attrs.id, tags });
  }
  return elements;
}

function parseAttrs(value) {
  const attrs = {};
  for (const match of String(value || "").matchAll(/([\w:-]+)="([^"]*)"/g)) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function decodeXml(value) {
  return String(value)
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function bestWebsiteTag(tags) {
  const keys = ["website", "contact:website", "url", "operator:website", "brand:website", "contact:facebook", "facebook", "social:facebook"];
  for (const key of keys) {
    if (tags[key]) return { key, value: tags[key] };
  }
  return null;
}

function pickWebsiteTags(tags) {
  const picked = {};
  for (const [key, value] of Object.entries(tags)) {
    if (/website|url/i.test(key)) picked[key] = value;
  }
  return picked;
}

function normaliseOnlinePresence(value, key) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (/facebook/i.test(key) && !/^https?:\/\//i.test(trimmed)) {
    const handle = trimmed.replace(/^@/, "").replace(/^facebook\.com\//i, "").replace(/^\/+/, "");
    if (!handle) return "";
    return "https://www.facebook.com/" + handle;
  }
  const first = trimmed.split(/\s+/)[0].replace(/[),.;]+$/g, "");
  const withProtocol = /^https?:\/\//i.test(first) ? first : "https://" + first;
  try {
    const url = new URL(withProtocol);
    if (!/^https?:$/i.test(url.protocol)) return "";
    return url.href;
  } catch {
    return "";
  }
}

function rejectCandidateUrl(course, url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "invalid-url";
  }
  const hostAndPath = (parsed.hostname + parsed.pathname).toLowerCase();
  if (/golfer\.com\.au\/directory|top100golfcourses|australia247|truelocal|yellowpages|whereis|findglocal|schoolandcollegelistings|clubsandpubsnearme/.test(hostAndPath)) {
    return "directory-page";
  }
  if (course.id === "lismore-golf-course" && course.state === "VIC" && /lismoreworkers\.com\.au/.test(hostAndPath)) {
    return "known-state-mismatch";
  }
  return "";
}

function webSearchUrl(name, town, state) {
  return "https://www.google.com/search?q=" + encodeURIComponent(`${name} ${town} ${state} golf club website`);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
