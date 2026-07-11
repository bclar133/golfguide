import fs from "node:fs";
import path from "node:path";

const courseFile = "courses.js";
const text = fs.readFileSync(courseFile, "utf8");
const match = text.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
if (!match) throw new Error("Could not parse courses.js");

const courses = JSON.parse(match[1]);
const knownMultiLocationHosts = new Set([
  "facebook.com",
  "nullarborlinks.com",
  "racv.com.au"
]);

const byHost = new Map();
for (const course of courses) {
  const host = normaliseHost(course.homepageUrl);
  if (!host) continue;
  if (!byHost.has(host)) byHost.set(host, []);
  byHost.get(host).push(course);
}

const crossStateHosts = [];
for (const [host, hostCourses] of byHost) {
  const states = unique(hostCourses.map((course) => course.state));
  const names = unique(hostCourses.map((course) => course.name));
  if (states.length <= 1 || knownMultiLocationHosts.has(host)) continue;
  crossStateHosts.push({
    host,
    states,
    courses: hostCourses.map((course) => ({
      id: course.id,
      name: course.name,
      town: course.town,
      state: course.state,
      homepageUrl: course.homepageUrl
    })),
    names
  });
}

const weakLocalMediaMatches = [];
for (const course of courses) {
  const imageUrl = String(course.imageUrl || "");
  if (!imageUrl.startsWith("assets/course-media/")) continue;
  const mediaName = path.parse(imageUrl).name;
  const courseTokenSet = new Set(tokens([course.id, course.name, course.town, course.region, ...(course.aliases || [])].join(" ")));
  const mediaTokens = tokens(mediaName);
  const overlap = mediaTokens.filter((token) => courseTokenSet.has(token));
  const exactNameMatch = mediaName.startsWith(slug(course.name));
  if (!exactNameMatch && overlap.length < 2) {
    weakLocalMediaMatches.push({
      id: course.id,
      name: course.name,
      state: course.state,
      imageUrl,
      mediaTokens,
      overlap
    });
  }
}

const report = {
  checkedAt: new Date().toISOString(),
  totalCourses: courses.length,
  issues: {
    crossStateHomepageHosts: crossStateHosts.length,
    weakLocalMediaMatches: weakLocalMediaMatches.length
  },
  crossStateHosts,
  weakLocalMediaMatches
};

console.log(JSON.stringify(report, null, 2));

function normaliseHost(value) {
  if (!value) return "";
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function tokens(value) {
  const stop = new Set([
    "and",
    "the",
    "golf",
    "club",
    "course",
    "country",
    "resort",
    "links",
    "public",
    "community",
    "logo",
    "image",
    "photo",
    "website",
    "crop",
    "pitch",
    "putt",
    "driving",
    "range",
    "minigolf"
  ]);
  return slug(value)
    .split("-")
    .filter((token) => token.length >= 3 && !stop.has(token));
}
