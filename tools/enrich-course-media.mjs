import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const courseFile = path.join(root, "courses.js");
const assetDir = path.join(root, "assets", "course-media");
const reportDir = path.join(root, "course-media-reports");
const bundledModules = "C:/Users/brent/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";
const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const runtimeArgs = globalThis.COURSE_MEDIA_ARGS || (typeof process !== "undefined" ? process.argv.slice(2) : []);
const args = parseArgs(runtimeArgs);
const writeChanges = Boolean(args.write);
const force = Boolean(args.force);
const includeScreenshots = Boolean(args.screenshots);
const localOnly = Boolean(args["local-only"]);
const limit = args.limit ? Number(args.limit) : 0;
const concurrency = Math.max(1, args.concurrency ? Number(args.concurrency) : 1);
const only = args.only ? String(args.only).toLowerCase() : "";
const timeoutMs = args.timeout ? Number(args.timeout) : 22000;

fs.mkdirSync(assetDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
const existingAssets = indexExistingAssets();

const parsed = readCourses();
const courses = parsed.courses;
const report = [];
let processed = 0;
let updated = 0;
let browser = null;
let browserPromise = null;
let chromium = null;

try {
  const selectedCourses = courses.filter(shouldProcess).slice(0, limit || undefined);
  processed = selectedCourses.length;
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, selectedCourses.length) }, async () => {
    while (nextIndex < selectedCourses.length) {
      const index = nextIndex;
      nextIndex += 1;
      const result = await enrichCourse(selectedCourses[index]);
      report[index] = result;
      if (result.updated) updated += 1;
    }
  }));
} finally {
  if (browser) await browser.close();
}

if (writeChanges && updated > 0) {
  fs.writeFileSync(courseFile, parsed.prefix + JSON.stringify(courses, null, 2) + ";\n", "utf8");
}

const reportPath = path.join(reportDir, "media-enrichment-" + timestamp() + ".json");
fs.writeFileSync(reportPath, JSON.stringify({ processed, updated, writeChanges, report }, null, 2) + "\n", "utf8");
console.log(JSON.stringify({ processed, updated, writeChanges, reportPath }, null, 2));

function parseArgs(raw) {
  const parsed = {};
  for (let index = 0; index < raw.length; index += 1) {
    const value = raw[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "write" || key === "force" || key === "screenshots" || key === "local-only") {
      parsed[key] = true;
    } else if (key === "no-screenshots") {
      parsed.screenshots = false;
    } else {
      parsed[key] = raw[index + 1];
      index += 1;
    }
  }
  return parsed;
}

function requireFromNodeModules(name) {
  const env = typeof process !== "undefined" && process.env ? process.env : {};
  const candidates = [env.NODE_MODULES_DIR, env.NODE_PATH, path.join(root, "node_modules"), bundledModules].filter(Boolean);
  for (const candidate of candidates) {
    const firstRoot = String(candidate).split(path.delimiter)[0];
    try {
      const requireBase = path.basename(firstRoot) === "node_modules" ? path.dirname(firstRoot) : firstRoot;
      return createRequire(pathToFileURL(path.join(requireBase, "noop.js")).href)(name);
    } catch {}
  }
  return createRequire(import.meta.url)(name);
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
  if (localOnly) return isWeakImage(course.imageUrl) && Boolean(findExistingAsset(course));
  if (!course.homepageUrl) {
    return Boolean(only) || (isWeakImage(course.imageUrl) && Boolean(findExistingAsset(course)));
  }
  if (force) return true;
  return isWeakImage(course.imageUrl);
}

function isWeakImage(url) {
  const value = String(url || "");
  return !value || value.includes("icons.duckduckgo.com") || value.includes("World_Imagery") || value.includes("course-photo-fallback.svg");
}

function indexExistingAssets() {
  const assets = [];
  const roots = [
    { dir: assetDir, rel: "assets/course-media" },
    { dir: path.join(root, "assets"), rel: "assets" }
  ];
  const skipped = new Set(["course-photo-fallback", "course-placeholder", "golf-ball-marker", "grass-texture", "icon"]);
  for (const source of roots) {
    if (!fs.existsSync(source.dir)) continue;
    for (const entry of fs.readdirSync(source.dir, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const parsed = path.parse(entry.name);
      const ext = parsed.ext.toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp", ".svg", ".avif"].includes(ext)) continue;
      if (skipped.has(parsed.name)) continue;
      const kind = /website-crop/i.test(parsed.name) ? "screenshot" : /image|photo/i.test(parsed.name) ? "image" : "logo";
      assets.push({
        basename: parsed.name,
        kind,
        relativePath: source.rel + "/" + entry.name,
        tokens: mediaTokens(parsed.name)
      });
    }
  }
  return assets;
}

function findExistingAsset(course) {
  const courseTokens = mediaTokens([course.id, course.name, course.town, course.region, ...(course.aliases || [])].filter(Boolean).join(" "));
  if (courseTokens.length < 2) return null;
  let best = null;
  for (const asset of existingAssets) {
    const overlap = asset.tokens.filter((token) => courseTokens.includes(token));
    const coverage = overlap.length / Math.max(1, asset.tokens.length);
    let score = overlap.length * 10 + coverage * 20;
    if (asset.kind === "logo") score += 8;
    if (asset.kind === "screenshot") score += 4;
    const exactSlugMatch = asset.basename.startsWith(slugify(course.name));
    if (exactSlugMatch) score += 80;
    if ((exactSlugMatch || overlap.length >= 3) && score >= 48 && (!best || score > best.score)) best = { ...asset, score };
  }
  return best;
}

function mediaTokens(value) {
  return slugify(value)
    .split("-")
    .filter((token) => token.length >= 3)
    .filter((token) => !["and", "the", "golf", "club", "course", "country", "resort", "links", "public", "community", "logo", "image", "photo", "website", "crop", "pitch", "putt", "driving", "range", "minigolf"].includes(token));
}

async function enrichCourse(course) {
  const result = { id: course.id, name: course.name, homepageUrl: course.homepageUrl || "", status: "pending", updated: false };
  const existingAsset = findExistingAsset(course);
  if (existingAsset) {
    const mediaKind = existingAsset.kind === "image" ? "photo" : "logo";
    updateCourseImage(course, existingAsset, mediaKind, "existing local " + existingAsset.kind);
    Object.assign(result, { status: "existing-local-asset", updated: true, imageUrl: existingAsset.relativePath, sourceReason: existingAsset.kind });
    return result;
  }
  if (!course.homepageUrl) {
    result.status = "missing-homepage";
    return result;
  }
  try {
    let html = "";
    let fetchError = "";
    try {
      html = await fetchText(course.homepageUrl);
    } catch (error) {
      fetchError = String(error && error.message ? error.message : error);
    }
    if (html) {
      const candidates = discoverImageCandidates(html, course.homepageUrl, course);
      result.candidateCount = candidates.length;
      for (const candidate of candidates) {
        const saved = await downloadCandidate(candidate, course);
        if (saved) {
          const mediaKind = candidate.reason.includes("image") ? "photo" : "logo";
          updateCourseImage(course, saved, mediaKind, candidate.reason);
          Object.assign(result, { status: "downloaded", updated: true, imageUrl: saved.relativePath, sourceUrl: candidate.url, sourceReason: candidate.reason, mediaKind });
          return result;
        }
      }
    } else {
      result.fetchError = fetchError;
      result.candidateCount = 0;
    }
    if (includeScreenshots && !isClearlyDeadPage(fetchError, html)) {
      const screenshot = await captureVisibleLogo(course);
      if (screenshot) {
        updateCourseImage(course, screenshot, "logo", "website screenshot crop");
        Object.assign(result, { status: "screenshot", updated: true, imageUrl: screenshot.relativePath, sourceUrl: course.homepageUrl, sourceReason: screenshot.reason });
        return result;
      }
    }
    result.status = "no-usable-image-found";
    return result;
  } catch (error) {
    result.status = "error";
    result.error = String(error && error.message ? error.message : error);
    return result;
  }
}

function isClearlyDeadPage(fetchError, html) {
  const errorText = String(fetchError || "");
  const pageText = String(html || "").slice(0, 5000);
  return /HTTP\s+(400|401|403|404|410)\b/i.test(errorText) || /forbidden|access denied|checking the site connection security|requires cookies|can't reach this page|your connection isn't private/i.test(pageText);
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": userAgent, "accept": "text/html,application/xhtml+xml" } });
  if (!response.ok) throw new Error("HTTP " + response.status + " for " + url);
  return response.text();
}

function discoverImageCandidates(html, baseUrl, course) {
  const candidates = [];
  for (const tag of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    const key = String(attrs.property || attrs.name || "").toLowerCase();
    const content = attrs.content;
    if (!content) continue;
    if (key.includes("logo")) addCandidate(candidates, content, baseUrl, 90, "metadata logo", course);
    else if (key === "og:image" || key === "twitter:image" || key === "twitter:image:src") addCandidate(candidates, content, baseUrl, 35, "metadata image", course);
  }
  for (const script of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    const text = decodeHtml(script[1]).trim();
    for (const item of tryJsonLd(text)) {
      const logo = firstString(item.logo);
      const image = firstString(item.image);
      if (logo) addCandidate(candidates, logo, baseUrl, 95, "json-ld logo", course);
      if (image) addCandidate(candidates, image, baseUrl, 40, "json-ld image", course);
    }
  }
  for (const tag of html.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = parseAttrs(tag[0]);
    const source = bestSource(attrs);
    if (!source) continue;
    const label = String((attrs.alt || "") + " " + (attrs.title || "") + " " + (attrs.class || "") + " " + (attrs.id || "") + " " + source);
    const score = scoreImage(label, attrs, course);
    if (score >= 30) addCandidate(candidates, source, baseUrl, score, "img score " + score, course);
  }
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  }).sort((a, b) => b.score - a.score).slice(0, 8);
}

function parseAttrs(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeHtml(match[3] || match[4] || match[5] || "");
  }
  return attrs;
}

function decodeHtml(value) {
  return String(value).replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

function tryJsonLd(text) {
  try {
    const parsed = JSON.parse(text);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    return items.flatMap((item) => Array.isArray(item["@graph"]) ? item["@graph"] : item);
  } catch {
    return [];
  }
}

function firstString(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value === "object") return value.url || value.contentUrl || "";
  return "";
}

function bestSource(attrs) {
  if (attrs.src) return attrs.src;
  if (!attrs.srcset) return "";
  const parts = attrs.srcset.split(",").map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1].split(/\s+/)[0] : "";
}

function addCandidate(candidates, rawUrl, baseUrl, score, reason, course) {
  try {
    const url = new URL(rawUrl, baseUrl).href;
    if (!/^https?:\/\//i.test(url)) return;
    const lowered = url.toLowerCase();
    const tokens = courseNameTokens(course);
    if (/\.(svg)(\?|#|$)/i.test(lowered)) score -= 10;
    if (/facebook|instagram|youtube|tripadvisor|loading|spinner|blank|pixel/i.test(lowered)) score -= 40;
    if (tokens.some((token) => lowered.includes(token))) score += 12;
    if (/logo/i.test(reason) && isDirectoryLikePage(baseUrl) && !tokens.some((token) => lowered.includes(token))) score -= 85;
    if (score >= 25) candidates.push({ url, score, reason });
  } catch {}
}

function isDirectoryLikePage(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return /queensland\.com|visit|tourism|atdw|golfer\.com\.au|golfnsw\.org\.au|golfwa\.org\.au|golf\.org\.au|gov\.au|council|facebook\.com/i.test(host);
  } catch {
    return false;
  }
}

function scoreImage(label, attrs, course) {
  const value = label.toLowerCase();
  let score = 0;
  if (/logo|crest|emblem|badge|brand/.test(value)) score += 70;
  if (/club|golf|course/.test(value)) score += 10;
  for (const token of courseNameTokens(course)) {
    if (value.includes(token)) score += 8;
  }
  if (/facebook|instagram|youtube|search|icon-|arrow|spinner|loader|blank|avatar/.test(value)) score -= 45;
  const width = Number(attrs.width || 0);
  const height = Number(attrs.height || 0);
  if (width && height) {
    if (width >= 80 && width <= 900 && height >= 25 && height <= 500) score += 12;
    if (width < 40 || height < 20) score -= 20;
  }
  return score;
}

function courseNameTokens(course) {
  return String(course.name + " " + course.town).toLowerCase().replace(/&/g, " and ").split(/[^a-z0-9]+/).filter((token) => token.length >= 4).filter((token) => !["golf", "club", "course", "community", "country", "public", "resort", "links", "bowls"].includes(token));
}

async function downloadCandidate(candidate, course) {
  try {
    const response = await fetch(candidate.url, { redirect: "follow", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": userAgent, "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8" } });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//i.test(contentType)) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < 600 || buffer.length > 5_000_000) return null;
    const ext = extensionFor(contentType, candidate.url);
    const basename = slugify(course.name) + "-" + (candidate.reason.includes("image") ? "image" : "logo") + "." + ext;
    const outputPath = path.join(assetDir, basename);
    fs.writeFileSync(outputPath, buffer);
    return { path: outputPath, relativePath: "assets/course-media/" + basename, reason: candidate.reason };
  } catch {
    return null;
  }
}

function extensionFor(contentType, url) {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  if (/svg/i.test(contentType)) return "svg";
  if (/jpe?g/i.test(contentType)) return "jpg";
  const match = String(url).match(/\.([a-z0-9]{3,4})(?:[?#]|$)/i);
  return match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

async function launchBrowser() {
  if (!chromium) {
    try {
      const playwright = requireFromNodeModules("playwright");
      chromium = playwright.chromium;
    } catch {
      throw new Error("Playwright is not available in this runtime.");
    }
  }
  const options = [
    { headless: true, channel: "msedge" },
    { headless: true, channel: "chrome" },
    { headless: true }
  ];
  let lastError = null;
  for (const option of options) {
    try {
      return await chromium.launch(option);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function captureVisibleLogo(course) {
  const playwrightCapture = await captureWithPlaywright(course);
  if (playwrightCapture) return playwrightCapture;
  return captureWithBrowserCli(course);
}

async function captureWithPlaywright(course) {
  try {
    if (!browserPromise) browserPromise = launchBrowser();
    browser = await browserPromise;
  } catch {
    return null;
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(course.homepageUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    await page.waitForTimeout(1800);
    await dismissCommonOverlays(page);
    const pageText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 3000) : "");
    if (isBlockedBrowserPageText(pageText)) {
      return null;
    }
    const clip = await page.evaluate(() => {
      const selectors = [
        "img[alt*='logo' i]",
        "img[src*='logo' i]",
        "[class*='logo' i] img",
        "[id*='logo' i] img",
        ".custom-logo-link",
        "[class*='logo' i]",
        "[id*='logo' i]",
        ".site-title",
        ".navbar-brand",
        "header img",
        "header svg",
        "header a[href='/']",
        "header a[href='./']"
      ];
      for (const selector of selectors) {
        const elements = Array.from(document.querySelectorAll(selector));
        for (const element of elements) {
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          if (rect.width >= 50 && rect.height >= 20 && rect.width <= 620 && rect.height <= 260 && rect.top >= -20 && rect.top <= 360 && style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity || 1) > 0.1) {
            const padding = 16;
            return {
              x: Math.max(0, rect.left - padding),
              y: Math.max(0, rect.top - padding),
              width: Math.min(window.innerWidth - Math.max(0, rect.left - padding), rect.width + padding * 2),
              height: Math.min(window.innerHeight - Math.max(0, rect.top - padding), rect.height + padding * 2),
              selector
            };
          }
        }
      }
      const header = document.querySelector("header, .site-header, .navbar, .main-header, .header");
      if (header) {
        const rect = header.getBoundingClientRect();
        if (rect.width >= 160 && rect.height >= 50 && rect.top <= 120) {
          return {
            x: Math.max(0, rect.left),
            y: Math.max(0, rect.top),
            width: Math.min(620, window.innerWidth - Math.max(0, rect.left), rect.width),
            height: Math.min(220, window.innerHeight - Math.max(0, rect.top), rect.height),
            selector: "header crop"
          };
        }
      }
      return { x: 0, y: 0, width: Math.min(620, window.innerWidth), height: Math.min(220, window.innerHeight), selector: "top-of-site crop" };
    });
    const basename = slugify(course.name) + "-website-crop.png";
    const outputPath = path.join(assetDir, basename);
    const rawBuffer = await page.screenshot({ type: "png", clip: { x: Math.round(clip.x), y: Math.round(clip.y), width: Math.max(80, Math.round(clip.width)), height: Math.max(40, Math.round(clip.height)) } });
    fs.writeFileSync(outputPath, rawBuffer);
    return { path: outputPath, relativePath: "assets/course-media/" + basename, reason: clip.selector };
  } catch {
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}

function isBlockedBrowserPageText(value) {
  return /checking the site connection security|requires cookies to be enabled|enable cookies|access denied|forbidden|verify you are human|captcha|your connection isn't private/i.test(String(value || ""));
}

async function captureWithBrowserCli(course) {
  const browserPath = findBrowserExecutable();
  if (!browserPath) return null;
  const basename = slugify(course.name) + "-website-crop.png";
  const outputPath = path.join(assetDir, basename);
  try {
    const dom = await runBrowserDump(browserPath, course.homepageUrl);
    if (isBrowserCliErrorPage(dom) || isBlockedBrowserPageText(dom)) return null;
    await runBrowserScreenshot(browserPath, course.homepageUrl, outputPath);
    const stats = fs.statSync(outputPath);
    if (stats.size < 5000) {
      fs.unlinkSync(outputPath);
      return null;
    }
    return { path: outputPath, relativePath: "assets/course-media/" + basename, reason: "browser top-of-site screenshot" };
  } catch {
    return null;
  }
}

function isBrowserCliErrorPage(value) {
  return /main-frame-error|DNS_PROBE|ERR_[A-Z_]+|This site can't be reached|Hmmm…? can't reach this page|reload-button|Check if there is a typo|web server is down|error code 52\d|website is currently unavailable|page you were looking for doesn't exist|page may have moved|website coming soon|domain is registered|may be for sale|buy this domain|domain parking|parked domain|casino|pokies|top casinos/i.test(String(value || ""));
}

function findBrowserExecutable() {
  const candidates = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || "";
}

function runBrowserScreenshot(browserPath, url, outputPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=820,260",
      "--virtual-time-budget=4500",
      "--screenshot=" + outputPath,
      url
    ], { stdio: "ignore" });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Browser screenshot timed out"));
    }, timeoutMs);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && fs.existsSync(outputPath)) resolve();
      else reject(new Error("Browser screenshot failed"));
    });
  });
}

function runBrowserDump(browserPath, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(browserPath, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--window-size=820,260",
      "--virtual-time-budget=4500",
      "--dump-dom",
      url
    ], { stdio: ["ignore", "pipe", "ignore"] });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Browser DOM dump timed out"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
      if (output.length > 1_000_000) output = output.slice(-1_000_000);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("exit", () => {
      clearTimeout(timer);
      resolve(output);
    });
  });
}

async function dismissCommonOverlays(page) {
  const labels = ["Accept", "I agree", "Agree", "Close", "No thanks"];
  for (const label of labels) {
    try {
      const locator = page.getByRole("button", { name: new RegExp(label, "i") }).first();
      if (await locator.isVisible({ timeout: 500 })) await locator.click({ timeout: 1000 });
    } catch {}
  }
}

function updateCourseImage(course, asset, mediaKind, source) {
  if (!writeChanges) return;
  course.imageUrl = asset.relativePath;
  course.mediaKind = mediaKind;
  course.imageAlt = course.name + " " + (mediaKind === "logo" ? "logo" : "course image");
  course.imageSource = source;
  if (!course.fallbackImageUrl || course.fallbackImageUrl.includes("course-photo-fallback.svg")) course.fallbackImageUrl = aerialTile(course);
}

function aerialTile(course) {
  const lon = Number(course.coordinates && course.coordinates[0]);
  const lat = Number(course.coordinates && course.coordinates[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return "";
  const z = 16;
  const latRad = lat * Math.PI / 180;
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/" + z + "/" + y + "/" + x;
}

function slugify(value) {
  return String(value).toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 90);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}
