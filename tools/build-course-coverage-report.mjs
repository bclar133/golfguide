import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const courseFile = path.join(root, "courses.js");
const reportDir = path.join(root, "course-media-reports");

fs.mkdirSync(reportDir, { recursive: true });

const courses = readCourses();
const byState = {};
for (const course of courses) {
  byState[course.state] ||= {
    total: 0,
    homepage: 0,
    missingHomepage: 0,
    logo: 0,
    homepageNoLogo: 0,
    weakHomepageMedia: 0
  };
  const row = byState[course.state];
  row.total += 1;
  if (course.homepageUrl) row.homepage += 1;
  else row.missingHomepage += 1;
  if (course.mediaKind === "logo") row.logo += 1;
  if (course.homepageUrl && course.mediaKind !== "logo") row.homepageNoLogo += 1;
  if (course.homepageUrl && isWeakImage(course.imageUrl)) row.weakHomepageMedia += 1;
}

const report = {
  generatedAt: new Date().toISOString(),
  totalCourses: courses.length,
  summary: {
    onlinePresence: courses.filter((course) => course.homepageUrl).length,
    missingOnlinePresence: courses.filter((course) => !course.homepageUrl).length,
    websites: courses.filter((course) => course.homepageUrl && onlinePresenceKind(course.homepageUrl) === "website").length,
    facebook: courses.filter((course) => course.homepageUrl && onlinePresenceKind(course.homepageUrl) === "facebook").length,
    councilOrGovernment: courses.filter((course) => course.homepageUrl && onlinePresenceKind(course.homepageUrl) === "council").length,
    golfProfiles: courses.filter((course) => course.homepageUrl && onlinePresenceKind(course.homepageUrl) === "golf-profile").length,
    directories: courses.filter((course) => course.homepageUrl && onlinePresenceKind(course.homepageUrl) === "directory").length,
    logo: courses.filter((course) => course.mediaKind === "logo").length,
    homepageNoLogo: courses.filter((course) => course.homepageUrl && course.mediaKind !== "logo").length,
    weakHomepageMedia: courses.filter((course) => course.homepageUrl && isWeakImage(course.imageUrl)).length
  },
  byState,
  queues: {
    missingHomepage: courses.filter((course) => !course.homepageUrl).map(queueRow),
    homepageNoLogo: courses.filter((course) => course.homepageUrl && course.mediaKind !== "logo").map(queueRow),
    weakHomepageMedia: courses.filter((course) => course.homepageUrl && isWeakImage(course.imageUrl)).map(queueRow)
  }
};

const reportPath = path.join(reportDir, "course-coverage-" + timestamp() + ".json");
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ reportPath, summary: report.summary, byState: report.byState }, null, 2));

function readCourses() {
  const text = fs.readFileSync(courseFile, "utf8");
  const match = text.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
  if (!match) throw new Error("Could not parse courses.js");
  return JSON.parse(match[1]);
}

function queueRow(course) {
  return {
    id: course.id,
    name: course.name,
    town: course.town,
    region: course.region,
    state: course.state,
    homepageUrl: course.homepageUrl || "",
    bookingUrl: course.bookingUrl || "",
    imageUrl: course.imageUrl || "",
    mediaKind: course.mediaKind || "",
    imageSource: course.imageSource || "",
    sourceId: course.sourceId || "",
    sourceUrl: course.sourceUrl || "",
    webSearchUrl: course.webSearchUrl || ""
  };
}

function isWeakImage(url) {
  const value = String(url || "");
  return !value || value.includes("icons.duckduckgo.com") || value.includes("World_Imagery") || value.includes("course-photo-fallback.svg");
}

function onlinePresenceKind(value) {
  let host = "";
  try {
    host = new URL(value).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "website";
  }
  if (host.includes("facebook.com") || host.includes("fb.com")) return "facebook";
  if (host.includes(".gov.au") || host.includes("council")) return "council";
  if (isGolfAustraliaHost(host)) return "golf-profile";
  if (host.includes("golfer.com.au") || host.includes("top100golfcourses.com")) return "directory";
  return "website";
}

function isGolfAustraliaHost(host) {
  return host === "golf.org.au" || host.endsWith(".golf.org.au") || host === "golf.com.au" || host.endsWith(".golf.com.au");
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
