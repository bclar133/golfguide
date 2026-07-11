import fs from "node:fs";
import { execFileSync } from "node:child_process";

const coursesPath = "courses.js";
const geonamesPath = process.argv[2];
const baselineSpec = process.argv[3] || "";

if (!geonamesPath) {
  throw new Error("Usage: node tools/enrich-course-locations.mjs <GeoNames AU.txt> [baseline git spec]");
}

const stateByAdmin1 = {
  "01": "ACT",
  "02": "NSW",
  "03": "NT",
  "04": "QLD",
  "05": "SA",
  "06": "TAS",
  "07": "VIC",
  "08": "WA"
};

const stateNames = new Set([
  "act",
  "australian capital territory",
  "nsw",
  "new south wales",
  "nt",
  "northern territory",
  "qld",
  "queensland",
  "sa",
  "south australia",
  "tas",
  "tasmania",
  "vic",
  "victoria",
  "wa",
  "western australia"
]);

const currentText = fs.readFileSync(coursesPath, "utf8");
const courses = parseCourses(currentText);
const baselineCourses = baselineSpec ? parseCourses(execFileSync("git", ["show", baselineSpec], { encoding: "utf8", maxBuffer: 80 * 1024 * 1024 })) : courses;
const baselineById = new Map(baselineCourses.map((course) => [course.id, course]));
const baselineBySourceId = new Map(baselineCourses.filter((course) => course.sourceId).map((course) => [course.sourceId, course]));
const places = loadPlaces(geonamesPath);

let updatedTownCount = 0;
let clearedTownCount = 0;
let clearedRegionCount = 0;

courses.forEach((course) => {
  const baseline = baselineById.get(course.id) || baselineBySourceId.get(course.sourceId) || course;

  if (isWeakPlace(baseline.town)) {
    const nearest = nearestPlace(course, places);
    if (nearest && nearest.distanceKm <= maxTownDistanceKm(course.state)) {
      course.town = nearest.place.name;
      updatedTownCount += 1;
    } else {
      course.town = "";
      clearedTownCount += 1;
    }
  }

  if (isWeakPlace(baseline.region)) {
    course.region = "";
    clearedRegionCount += 1;
  }

  course.summary = cleanSummary(course.summary, course);
  course.webSearchUrl = webSearchUrl(course.name, course.town || course.region || course.state, course.state);
});

const output = currentText.replace(/window\.GOLF_COURSES\s*=\s*[\s\S]*;\s*$/, "window.GOLF_COURSES = " + JSON.stringify(courses, null, 2) + ";\n");
fs.writeFileSync(coursesPath, output, "utf8");

console.log(JSON.stringify({
  totalCourses: courses.length,
  places: places.length,
  updatedTownCount,
  clearedTownCount,
  clearedRegionCount
}, null, 2));

function parseCourses(text) {
  const match = text.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
  if (!match) {
    throw new Error("Could not parse courses.js");
  }
  return JSON.parse(match[1]);
}

function loadPlaces(path) {
  return fs.readFileSync(path, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((row) => row.split("\t"))
    .filter((columns) => columns[6] === "P" && stateByAdmin1[columns[10]])
    .map((columns) => ({
      name: columns[1],
      latitude: Number(columns[4]),
      longitude: Number(columns[5]),
      state: stateByAdmin1[columns[10]],
      featureCode: columns[7],
      population: Number(columns[14]) || 0
    }))
    .filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
}

function nearestPlace(course, allPlaces) {
  if (!Array.isArray(course.coordinates) || course.coordinates.length < 2) return null;

  let best = null;
  allPlaces.forEach((place) => {
    if (place.state !== course.state) return;
    const distanceKm = haversineKm(course.coordinates[1], course.coordinates[0], place.latitude, place.longitude);
    if (!best || distanceKm < best.distanceKm) {
      best = { place, distanceKm };
    }
  });
  return best;
}

function maxTownDistanceKm(state) {
  return state === "NT" || state === "WA" || state === "QLD" || state === "SA" ? 45 : 25;
}

function cleanSummary(value, course) {
  const summary = String(value || "").trim();
  const generic = genericSummary(course);
  if (!summary || /^Golf course in /i.test(summary)) return generic;
  return summary.replace(/Golf course in [A-Z]{2,3}, [A-Z]{2,3}, [A-Z]{2,3}\./g, generic);
}

function genericSummary(course) {
  const place = locationParts(course).join(", ");
  return place ? "Golf course in " + place + "." : "Golf course in Australia.";
}

function locationParts(course) {
  const seen = new Set();
  return [course.town, course.region, course.state].filter((part) => {
    const value = String(part || "").trim();
    const key = normaliseName(value);
    if (!value || value === "Australia" || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWeakPlace(value) {
  const place = String(value || "").trim();
  return !place || place === "Australia" || stateNames.has(normaliseName(place));
}

function normaliseName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function webSearchUrl(name, town, state) {
  return "https://www.google.com/search?q=" + encodeURIComponent(`${name} ${town} ${state} golf club website`);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const earthRadius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}
