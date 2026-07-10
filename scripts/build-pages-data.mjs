import fs from 'node:fs';

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];
const userAgent = 'AussieGolfGuide/0.2 (github.com/bclar133/golfguide)';
const states = [
  { code: 'ACT', iso: 'AU-ACT' },
  { code: 'NSW', iso: 'AU-NSW' },
  { code: 'NT', iso: 'AU-NT' },
  { code: 'QLD', iso: 'AU-QLD' },
  { code: 'SA', iso: 'AU-SA' },
  { code: 'TAS', iso: 'AU-TAS' },
  { code: 'VIC', iso: 'AU-VIC' },
  { code: 'WA', iso: 'AU-WA' }
];

const courseOverrides = {
  'osm-relation-4180856': {
    id: 'belconnen-golf-course',
    name: 'Burns Golf Club Belconnen',
    town: 'Holt',
    region: 'Belconnen',
    state: 'ACT',
    holes: '18',
    homepageUrl: 'https://www.burnsclub.com.au/burnsgolfclubbelconnen/',
    bookingUrl: 'https://belconnen.miclub.com.au/cms/public-bookings/',
    summary: '18 hole Par 72 course at Burns Golf Club Belconnen in Holt.',
    aliases: ['Belconnen Golf Course']
  },
  'osm-relation-4238666': {
    id: 'beachside-championship-golf-course',
    name: 'Palmer Coolum Resort',
    town: 'Mount Coolum',
    region: 'Coolum Beach',
    state: 'QLD',
    holes: '18',
    priceLevel: 4,
    homepageUrl: 'https://palmercoolumresort.com.au/',
    summary: '18 hole Par 72 resort course at Mount Coolum.',
    aliases: ['Beachside Championship Golf Course']
  },
  'osm-way-766598205': {
    id: 'mount-isa-golf-course',
    name: 'Mount Isa Golf Club',
    town: 'Mica Creek',
    region: 'Mount Isa',
    state: 'QLD',
    homepageUrl: 'https://www.mountisagolfclub.com.au/',
    bookingUrl: 'https://www.mountisagolfclub.com.au/contact-us',
    summary: 'Community golf club in Mount Isa, Queensland.'
  },
  'osm-way-961227563': {
    id: 'croydon-golf-course',
    name: 'Croydon Savannah Golf Course',
    town: 'Croydon',
    region: 'Outback Queensland',
    state: 'QLD',
    holes: '9',
    access: 'Council course',
    homepageUrl: 'https://www.croydon.qld.gov.au/Arts-Culture/Art-and-Leisure/Golf-Course',
    summary: 'Council-run Savannah Golf course in Croydon, Queensland.'
  },
  'osm-way-967730242': {
    id: 'birdsville-dunes-golf-club',
    name: 'Birdsville Dunes Golf Club',
    town: 'Birdsville',
    region: 'Outback Queensland',
    state: 'QLD',
    priceLevel: 3,
    homepageUrl: 'https://www.queensland.com/au/en/things-to-do/attractions/p-681d2a28b4faa09a59d432a8-birdsville-dunes-golf-club',
    imageUrl: 'https://assets.atdw-online.com.au/images/0dbbe27ed1fcbf4907c184742ec33bb3.jpeg?rect=3%2C0%2C3684%2C2763&w=2048&h=1536&rot=360&q=eyJ0eXBlIjoibGlzdGluZyIsImxpc3RpbmdJZCI6IjY4MWQyYTI4YjRmYWEwOWE1OWQ0MzJhOCIsImRpc3RyaWJ1dG9ySWQiOiI1NmIxZWI5MzQ0ZmVjYTNkZjJlMzIwY2IiLCJhcGlrZXlJZCI6IjU2YjFlZmVlMGNmMjEzYWQyMGRkMjE3MCJ9',
    mediaKind: 'photo',
    summary: 'Remote outback golf course with red sand fairways and sand greens in Birdsville, Queensland.'
  },
  'osm-way-167272883': {
    id: 'boort-golf-course',
    name: 'Boort Golf Course',
    town: 'Boort',
    region: 'Loddon Mallee',
    state: 'VIC',
    homepageUrl: 'https://boort.com.au/community-services/community-groups/golf-club/',
    summary: 'Community golf course in Boort, Victoria.'
  },
  'osm-way-60347905': {
    id: 'marysville-community-golf-and-bowls-club',
    name: 'Marysville Community Golf & Bowls Club',
    town: 'Marysville',
    region: 'Yarra Ranges',
    state: 'VIC',
    holes: '18',
    priceLevel: 2,
    homepageUrl: 'https://www.marysvillegolfandbowls.com.au/'
  }
};

const supplementalCourses = [
  {
    id: 'bonville-golf-resort',
    name: 'Bonville Golf Resort',
    town: 'Bonville',
    region: 'Coffs Coast',
    state: 'NSW',
    coordinates: [153.0605, -30.3762],
    holes: '18',
    access: 'Golf resort',
    priceLevel: 5,
    homepageUrl: 'https://www.bonvillegolf.com.au/',
    summary: 'Destination golf resort near Coffs Harbour.'
  },
  {
    id: 'riverside-oaks-golf-resort',
    name: 'Riverside Oaks Golf Resort',
    town: 'Cattai',
    region: 'Hawkesbury',
    state: 'NSW',
    coordinates: [150.9302, -33.5637],
    holes: '36',
    access: 'Golf resort',
    priceLevel: 4,
    homepageUrl: 'https://www.riversideoaks.com.au/',
    summary: 'Golf resort on the Hawkesbury River with two championship courses.'
  },
  {
    id: 'new-south-wales-golf-club',
    name: 'New South Wales Golf Club',
    town: 'La Perouse',
    region: 'Sydney',
    state: 'NSW',
    coordinates: [151.2492, -33.989],
    holes: '18',
    access: 'Private club',
    priceLevel: 5,
    homepageUrl: 'https://www.nswgolfclub.com.au/',
    summary: 'Championship links-style course at La Perouse.'
  },
  {
    id: 'brisbane-golf-club',
    name: 'Brisbane Golf Club',
    town: 'Yeerongpilly',
    region: 'Brisbane',
    state: 'QLD',
    coordinates: [153.0022, -27.5284],
    holes: '18',
    access: 'Private club',
    priceLevel: 4,
    homepageUrl: 'https://www.brisbanegolfclub.com.au/',
    summary: 'Private club course in Yeerongpilly, Brisbane.'
  },
  {
    id: 'sanctuary-cove-golf-and-country-club',
    name: 'Sanctuary Cove Golf and Country Club',
    town: 'Hope Island',
    region: 'Gold Coast',
    state: 'QLD',
    coordinates: [153.3622, -27.8533],
    holes: '36',
    access: 'Private club',
    priceLevel: 5,
    homepageUrl: 'https://www.sanctuarycovegolf.com.au/',
    summary: 'Gold Coast country club with The Pines and The Palms courses.'
  },
  {
    id: 'woodford-golf-club-qld',
    name: 'Woodford Golf Club',
    town: 'Woodford',
    region: 'Moreton Bay',
    state: 'QLD',
    coordinates: [152.791265, -26.950042],
    holes: '18',
    access: 'Public access',
    priceLevel: 2,
    homepageUrl: '',
    summary: '18-hole golf course in Woodford, Queensland. No dedicated club website found yet.',
    sourceUrl: 'https://www.openstreetmap.org/way/131822526'
  },
  {
    id: 'noosa-springs-golf-and-spa-resort',
    name: 'Noosa Springs Golf and Spa Resort',
    town: 'Noosa Heads',
    region: 'Sunshine Coast',
    state: 'QLD',
    coordinates: [153.1044, -26.4191],
    holes: '18',
    access: 'Golf resort',
    priceLevel: 5,
    homepageUrl: 'https://www.noosasprings.com.au/',
    summary: 'Resort course in Noosa Heads on the Sunshine Coast.'
  },
  {
    id: 'maleny-golf-club',
    name: 'Maleny Golf Club',
    town: 'North Maleny',
    region: 'Sunshine Coast',
    state: 'QLD',
    coordinates: [152.866454, -26.762718],
    holes: '18',
    access: 'Public access',
    priceLevel: 3,
    homepageUrl: 'https://www.malenygolfclub.com.au/',
    bookingUrl: 'https://malenygc.miclub.com.au/cms/public-bookings/',
    summary: '18-hole par 69 public-access course at 15 Porters Lane, North Maleny.',
    sourceUrl: 'https://www.malenygolfclub.com.au/'
  },
  {
    id: 'hamilton-island-golf-club',
    name: 'Hamilton Island Golf Club',
    town: 'Dent Island',
    region: 'Whitsundays',
    state: 'QLD',
    coordinates: [148.9462, -20.3476],
    holes: '18',
    access: 'Golf club',
    priceLevel: 5,
    homepageUrl: 'https://www.hamiltonislandgolfclub.com.au/',
    summary: 'Island golf course on Dent Island in the Whitsundays.'
  },
  {
    id: 'links-lady-bay-golf-course',
    name: 'Links Lady Bay Golf Course',
    town: 'Normanville',
    region: 'Fleurieu Peninsula',
    state: 'SA',
    coordinates: [138.3117, -35.4517],
    holes: '18',
    access: 'Golf course',
    priceLevel: 4,
    homepageUrl: 'https://www.linksladybay.com.au/',
    summary: 'Links-style course at Normanville on the Fleurieu Peninsula.'
  },
  {
    id: 'ocean-dunes-golf-course',
    name: 'Ocean Dunes Golf Course',
    town: 'Currie',
    region: 'King Island',
    state: 'TAS',
    coordinates: [143.847579, -39.896519],
    holes: '18',
    access: 'Golf course',
    priceLevel: 5,
    homepageUrl: 'https://oceandunes.com.au/',
    summary: 'Coastal links course on King Island.'
  },
  {
    id: 'st-andrews-beach-golf-course',
    name: 'St Andrews Beach Golf Course',
    town: 'Fingal',
    region: 'Mornington Peninsula',
    state: 'VIC',
    coordinates: [144.8249, -38.4149],
    holes: '18',
    access: 'Public access',
    priceLevel: 4,
    homepageUrl: 'https://standrewsbeachgolf.com.au/',
    summary: 'Public access course on the Mornington Peninsula.'
  },
  {
    id: 'the-vines-resort-golf-club',
    name: 'The Vines Resort Golf Club',
    town: 'The Vines',
    region: 'Swan Valley',
    state: 'WA',
    coordinates: [116.0065, -31.7544],
    holes: '36',
    access: 'Golf resort',
    priceLevel: 4,
    homepageUrl: 'https://www.vines.com.au/',
    summary: 'Resort golf club in the Swan Valley.'
  }
];

async function main() {
  const generated = [];
  const rawSeen = new Set();
  const importNotes = [];

  for (const state of states) {
    const elements = await fetchStateElements(state);
    importNotes.push(`${state.code}:${elements.length}`);
    for (const element of elements) {
      const sourceId = sourceIdFor(element);
      if (rawSeen.has(sourceId)) continue;
      rawSeen.add(sourceId);
      const course = fromOverpass(element, state);
      if (course) generated.push(course);
    }
  }

  if (generated.length <= 100) {
    throw new Error('OpenStreetMap import failed; refusing to deploy preview fallback data.');
  }

  const merged = mergeSupplementals(generated, supplementalCourses.map(makeSupplemental));
  const deduped = dedupe(merged).sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  const mediaStats = await enrichWebsiteMedia(deduped);
  const output = '// Generated by scripts/build-pages-data.mjs from OpenStreetMap/Overpass plus verified supplements.\nwindow.GOLF_COURSES = ' + JSON.stringify(deduped, null, 2) + ';\n';
  fs.writeFileSync('courses.js', output, 'utf8');
  console.log(`Generated ${deduped.length} courses (${importNotes.join(', ')}). Media: ${JSON.stringify(mediaStats)}`);
}

async function fetchStateElements(state) {
  const query = `[out:json][timeout:180];
area["ISO3166-2"="${state.iso}"][admin_level=4]->.stateArea;
(
  node["leisure"="golf_course"](area.stateArea);
  way["leisure"="golf_course"](area.stateArea);
  relation["leisure"="golf_course"](area.stateArea);
  node["sport"="golf"]["name"](area.stateArea);
  way["sport"="golf"]["name"](area.stateArea);
  relation["sport"="golf"]["name"](area.stateArea);
);
out center tags;`;

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'user-agent': userAgent
        },
        body: new URLSearchParams({ data: query })
      });
      if (!response.ok) throw new Error(`${endpoint} returned HTTP ${response.status}`);
      const data = await response.json();
      const elements = Array.isArray(data.elements) ? data.elements : [];
      if (elements.length) return elements;
      throw new Error(`${endpoint} returned no ${state.code} elements`);
    } catch (error) {
      console.warn(`${state.code}: ${String(error && error.message ? error.message : error)}`);
    }
  }

  return [];
}

function fromOverpass(element, stateContext) {
  const tags = element.tags || {};
  const lon = Number(element.lon ?? element.center?.lon);
  const lat = Number(element.lat ?? element.center?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const rawName = clean(tags.name || tags.official_name || tags.short_name || 'Golf Course near ' + townFromTags(tags));
  if (!isCourseLike(tags, rawName, element)) return null;

  const sourceId = sourceIdFor(element);
  const state = clean(normaliseState(tags['addr:state']) || stateContext.code || inferState(lon, lat));
  const town = clean(tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:locality'] || tags['is_in:city'] || state);
  const region = clean(tags['is_in:region'] || tags['addr:region'] || town || state);
  const website = firstUrl(tags.website || tags['contact:website'] || tags.url || tags['contact:url']);
  const booking = firstUrl(tags.booking || tags['booking:website'] || tags['reservation:website']);
  const coords = [round(lon), round(lat)];
  const aerial = aerialTile(coords);
  const sourceUrl = `https://www.openstreetmap.org/${element.type}/${element.id}`;

  let course = {
    id: slug(rawName),
    name: rawName,
    town,
    region,
    state,
    coordinates: coords,
    holes: clean(tags.holes || ''),
    access: accessLabel(tags),
    priceLevel: priceLevel(tags, rawName),
    homepageUrl: website,
    bookingUrl: booking,
    imageUrl: website ? favicon(website) : aerial,
    fallbackImageUrl: aerial,
    imageAlt: `${rawName} ${website ? 'logo' : 'aerial course image'}`,
    mediaKind: website ? 'logo' : 'photo',
    summary: summary(tags, town, region, state),
    source: 'OpenStreetMap',
    sourceId,
    sourceUrl,
    webSearchUrl: webSearchUrl(rawName, town, state)
  };

  const override = courseOverrides[sourceId];
  if (override) {
    const aliases = new Set([...(course.aliases || []), ...(override.aliases || [])]);
    if (override.name && override.name !== course.name) aliases.add(course.name);
    course = { ...course, ...override, aliases: Array.from(aliases) };
    course.webSearchUrl = webSearchUrl(course.name, course.town, course.state);
    course.fallbackImageUrl = course.fallbackImageUrl || aerial;
    if (!course.imageUrl || course.imageUrl === favicon(website) || course.imageUrl === aerial) {
      course.imageUrl = course.homepageUrl ? favicon(course.homepageUrl) : aerial;
      course.mediaKind = course.homepageUrl ? 'logo' : 'photo';
    }
    course.imageAlt = `${course.name} ${course.mediaKind === 'logo' ? 'logo' : 'aerial course image'}`;
  }

  return course;
}

function makeSupplemental(course) {
  const fallback = course.fallbackImageUrl || aerialTile(course.coordinates);
  const imageUrl = course.imageUrl || (course.homepageUrl ? favicon(course.homepageUrl) : fallback);
  return {
    id: course.id,
    name: course.name,
    town: course.town,
    region: course.region,
    state: course.state,
    coordinates: course.coordinates,
    holes: course.holes || '',
    access: course.access || 'Golf course',
    priceLevel: course.priceLevel || 3,
    homepageUrl: course.homepageUrl || '',
    bookingUrl: course.bookingUrl || '',
    imageUrl,
    fallbackImageUrl: fallback,
    imageAlt: `${course.name} ${course.homepageUrl ? 'logo' : 'aerial course image'}`,
    mediaKind: course.homepageUrl ? 'logo' : 'photo',
    summary: course.summary || `Golf course in ${[course.town, course.region, course.state].filter(Boolean).join(', ')}.`,
    source: course.source || 'Verified supplemental course',
    sourceId: course.sourceId || `supplemental-${course.id}`,
    sourceUrl: course.sourceUrl || course.homepageUrl || '',
    webSearchUrl: webSearchUrl(course.name, course.town, course.state)
  };
}

function mergeSupplementals(generated, supplementals) {
  const removeKeys = new Set();
  for (const course of supplementals) {
    courseKeys(course).forEach((key) => removeKeys.add(key));
  }
  return generated.filter((course) => !courseKeys(course).some((key) => removeKeys.has(key))).concat(supplementals);
}

function dedupe(items) {
  const byKey = new Map();
  for (const item of items) {
    const primary = item.sourceId || item.id || slug(item.name + '-' + item.state + '-' + item.town);
    const secondary = slug(item.name + '-' + item.state + '-' + item.town);
    if (byKey.has(primary)) byKey.delete(primary);
    if (byKey.has(secondary)) byKey.delete(secondary);
    byKey.set(primary, item);
  }
  return Array.from(byKey.values());
}

function courseKeys(course) {
  return [
    course.sourceId,
    course.id,
    slug(course.name + '-' + course.state + '-' + course.town)
  ].filter(Boolean);
}

async function enrichWebsiteMedia(courses) {
  const stats = { checked: 0, upgraded: 0, failed: 0 };
  const targets = courses.filter((course) => course.homepageUrl && (!course.imageUrl || course.imageUrl.includes('icons.duckduckgo.com')));
  await mapLimit(targets, 10, async (course) => {
    stats.checked += 1;
    try {
      const media = await fetchWebsiteMedia(course.homepageUrl);
      if (!media) return;
      course.imageUrl = media.url;
      course.mediaKind = media.kind;
      course.imageAlt = `${course.name} ${media.kind === 'logo' ? 'logo' : 'course photo'}`;
      course.imageSource = media.source;
      stats.upgraded += 1;
    } catch {
      stats.failed += 1;
    }
  });
  return stats;
}

async function fetchWebsiteMedia(homepageUrl) {
  const response = await fetch(homepageUrl, {
    headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml' },
    redirect: 'follow',
    signal: AbortSignal.timeout(5500)
  });
  if (!response.ok) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null;
  const html = await response.text();
  return extractMedia(html, response.url || homepageUrl);
}

function extractMedia(html, baseUrl) {
  const logoImage = bestLogoImage(html, baseUrl);
  if (logoImage) return { url: logoImage, kind: 'logo', source: 'official homepage logo' };

  const jsonLdLogo = firstJsonLdImage(html, baseUrl, ['logo']);
  if (jsonLdLogo) return { url: jsonLdLogo, kind: 'logo', source: 'official homepage json-ld logo' };

  const metaImage = firstMetaImage(html, baseUrl);
  if (metaImage) return { url: metaImage, kind: 'photo', source: 'official homepage social image' };

  const jsonLdImage = firstJsonLdImage(html, baseUrl, ['image', 'photo']);
  if (jsonLdImage) return { url: jsonLdImage, kind: 'photo', source: 'official homepage json-ld image' };

  const icon = firstIcon(html, baseUrl);
  if (icon) return { url: icon, kind: 'logo', source: 'official homepage icon' };

  return null;
}

function bestLogoImage(html, baseUrl) {
  const matches = Array.from(html.matchAll(/<img\b[^>]*>/gi));
  let best = null;
  let bestScore = 0;
  for (const match of matches) {
    const tag = match[0];
    const src = attr(tag, 'src') || attr(tag, 'data-src') || attr(tag, 'data-lazy-src');
    if (!src) continue;
    const text = `${attr(tag, 'alt')} ${attr(tag, 'class')} ${attr(tag, 'id')} ${src}`.toLowerCase();
    let score = 0;
    if (text.includes('logo')) score += 80;
    if (text.includes('brand')) score += 35;
    if (text.includes('header')) score += 25;
    if (text.includes('site')) score += 10;
    if (/\.svg(\?|$)/i.test(src)) score += 10;
    if (!isUsableImageUrl(src)) continue;
    if (score > bestScore) {
      bestScore = score;
      best = absoluteUrl(src, baseUrl);
    }
  }
  return bestScore >= 50 ? best : null;
}

function firstMetaImage(html, baseUrl) {
  const names = ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src'];
  for (const name of names) {
    const pattern = new RegExp(`<meta\\b[^>]*(?:property|name)=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
    const tag = html.match(pattern)?.[0];
    const content = tag ? attr(tag, 'content') : '';
    if (content && isUsableImageUrl(content)) return absoluteUrl(content, baseUrl);
  }
  return null;
}

function firstIcon(html, baseUrl) {
  const matches = Array.from(html.matchAll(/<link\b[^>]*>/gi));
  for (const match of matches) {
    const tag = match[0];
    const rel = attr(tag, 'rel').toLowerCase();
    if (!rel.includes('icon')) continue;
    const href = attr(tag, 'href');
    if (href && isUsableImageUrl(href)) return absoluteUrl(href, baseUrl);
  }
  return null;
}

function firstJsonLdImage(html, baseUrl, fields) {
  const scripts = Array.from(html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi));
  for (const script of scripts) {
    const text = stripHtml(script[1]).trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text);
      const found = findJsonLdField(parsed, fields);
      if (found && isUsableImageUrl(found)) return absoluteUrl(found, baseUrl);
    } catch {
      // Ignore broken structured data.
    }
  }
  return null;
}

function findJsonLdField(value, fields) {
  if (!value) return '';
  if (typeof value === 'string') return '';
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdField(item, fields);
      if (found) return found;
    }
    return '';
  }
  if (typeof value === 'object') {
    for (const field of fields) {
      const next = value[field];
      if (typeof next === 'string') return next;
      if (Array.isArray(next) && typeof next[0] === 'string') return next[0];
      if (next && typeof next === 'object' && typeof next.url === 'string') return next.url;
    }
    for (const nested of Object.values(value)) {
      const found = findJsonLdField(nested, fields);
      if (found) return found;
    }
  }
  return '';
}

async function mapLimit(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index];
      index += 1;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

function isCourseLike(tags, name, element) {
  const leisure = String(tags.leisure || '').toLowerCase();
  const sport = String(tags.sport || '').toLowerCase();
  const golf = String(tags.golf || '').toLowerCase();
  if (['hole', 'tee', 'green', 'fairway', 'bunker', 'water_hazard', 'driving_range'].includes(golf)) return false;
  if (leisure === 'golf_course' || golf === 'course') return true;
  if (sport === 'golf') {
    if (element.type !== 'node') return true;
    return /golf|links|country club|resort|course|club|dunes/i.test(name);
  }
  return false;
}

function accessLabel(tags) {
  const access = String(tags.access || '').toLowerCase();
  if (access === 'private' || tags.private === 'yes') return 'Private club';
  if (access === 'customers') return 'Public access';
  if (access === 'permissive' || access === 'yes' || !access) return 'Golf course';
  return clean(tags.access || 'Golf course');
}

function priceLevel(tags, name) {
  const text = `${name} ${tags.access || ''} ${tags.fee || ''} ${tags.operator || ''}`.toLowerCase();
  if (/royal|barnbougle|resort|links|private|championship|sanctuary|joondalup|brookwater|hamilton island|bonville|ocean dunes/.test(text)) return 5;
  if (/country club|club|fee|yes/.test(text)) return 3;
  return 2;
}

function summary(tags, town, region, state) {
  const bits = [];
  if (tags.holes) bits.push(`${tags.holes} holes`);
  if (tags.par) bits.push(`Par ${tags.par}`);
  if (tags.operator) bits.push(`Operated by ${tags.operator}`);
  const prefix = bits.length ? bits.join(' - ') + '. ' : '';
  return prefix + `Golf course in ${[town, region, state].filter(Boolean).join(', ')}.`;
}

function normaliseState(value) {
  const text = clean(value).toUpperCase();
  const aliases = {
    'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
    'NEW SOUTH WALES': 'NSW',
    'NORTHERN TERRITORY': 'NT',
    QUEENSLAND: 'QLD',
    'SOUTH AUSTRALIA': 'SA',
    TASMANIA: 'TAS',
    VICTORIA: 'VIC',
    'WESTERN AUSTRALIA': 'WA'
  };
  return aliases[text] || (states.some((state) => state.code === text) ? text : '');
}

function inferState(lon, lat) {
  if (lon >= 148.75 && lon <= 149.45 && lat >= -35.95 && lat <= -35.1) return 'ACT';
  if (lat < -39) return 'TAS';
  if (lon < 129) return 'WA';
  if (lon >= 129 && lon < 138) return lat > -26 ? 'NT' : 'SA';
  if (lon >= 138 && lon < 141) return lat > -29 ? 'QLD' : 'SA';
  if (lon >= 141 && lon < 144) return lat > -29 ? 'QLD' : lat > -36 ? 'NSW' : 'VIC';
  if (lon >= 144 && lon < 150) return lat > -37 ? 'NSW' : 'VIC';
  if (lon >= 150) return lat > -29 ? 'QLD' : 'NSW';
  return 'AU';
}

function townFromTags(tags) {
  return tags['addr:city'] || tags['addr:town'] || tags['addr:suburb'] || tags['addr:locality'] || tags['is_in:city'] || 'Australia';
}

function firstUrl(value) {
  const text = String(value || '').split(';')[0].trim();
  if (!text) return '';
  return /^https?:\/\//i.test(text) ? text : 'https://' + text.replace(/^\/\//, '');
}

function favicon(value) {
  try {
    const host = new URL(value).hostname;
    return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  } catch {
    return '';
  }
}

function aerialTile(coords) {
  const lon = Number(coords[0]);
  const lat = Number(coords[1]);
  const z = 16;
  const latRad = lat * Math.PI / 180;
  const n = 2 ** z;
  const x = Math.floor((lon + 180) / 360 * n);
  const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
  return `https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}

function sourceIdFor(element) {
  return `osm-${element.type}-${element.id}`;
}

function webSearchUrl(name, town, state) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(`${name} ${town} ${state} golf club website`);
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')) || tag.match(new RegExp(`${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return decodeEntities(match ? match[2] || match[1] || '' : '');
}

function absoluteUrl(value, baseUrl) {
  try {
    return new URL(decodeEntities(value), baseUrl).href;
  } catch {
    return '';
  }
}

function isUsableImageUrl(value) {
  const text = String(value || '').trim();
  if (!text || text.startsWith('data:') || text.startsWith('#')) return false;
  if (/\.gif(\?|$)/i.test(text)) return false;
  return true;
}

function stripHtml(value) {
  return String(value || '').replace(/<!--([\s\S]*?)-->/g, '').replace(/<[^>]*>/g, '');
}

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clean(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function slug(value) {
  return String(value || 'course').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
}

function round(value) {
  return Math.round(Number(value) * 1000000) / 1000000;
}

await main();
