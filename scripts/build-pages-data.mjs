import fs from 'node:fs';

const endpoints = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.ru/api/interpreter'
];
const userAgent = 'AussieGolfGuide/0.4 (github.com/bclar133/golfguide)';
const stateAreas = [
  { code: 'ACT', iso: 'AU-ACT' },
  { code: 'NSW', iso: 'AU-NSW' },
  { code: 'NT', iso: 'AU-NT' },
  { code: 'QLD', iso: 'AU-QLD' },
  { code: 'SA', iso: 'AU-SA' },
  { code: 'TAS', iso: 'AU-TAS' },
  { code: 'VIC', iso: 'AU-VIC' },
  { code: 'WA', iso: 'AU-WA' }
];
const stateCodes = stateAreas.map((state) => state.code);
const importConcurrency = 1;

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
  },
  'osm-way-607257332': {
    state: 'QLD',
    town: 'Dirranbandi',
    region: 'Balonne'
  },
  'osm-way-948319897': {
    state: 'QLD',
    town: 'Mungindi',
    region: 'Balonne'
  },
  'osm-way-1180438492': {
    state: 'QLD',
    town: 'St George',
    region: 'Balonne'
  },
  'osm-way-185762691': {
    state: 'QLD',
    town: 'Goondiwindi',
    region: 'Goondiwindi'
  },
  'osm-way-41879524': {
    state: 'QLD',
    town: 'Mitchell',
    region: 'Maranoa'
  },
  'osm-node-8720147542': {
    state: 'QLD',
    town: 'Dunkeld',
    region: 'Maranoa'
  },
  'osm-way-222727122': {
    state: 'NSW',
    town: 'Tenterfield',
    region: 'Northern Tablelands'
  }
};

const supplementalCourses = [
  supplemental('bonville-golf-resort', 'Bonville Golf Resort', 'Bonville', 'Coffs Coast', 'NSW', [153.0605, -30.3762], '18', 'Golf resort', 5, 'https://www.bonvillegolf.com.au/', '', 'Destination golf resort near Coffs Harbour.'),
  supplemental('riverside-oaks-golf-resort', 'Riverside Oaks Golf Resort', 'Cattai', 'Hawkesbury', 'NSW', [150.9302, -33.5637], '36', 'Golf resort', 4, 'https://www.riversideoaks.com.au/', '', 'Golf resort on the Hawkesbury River with two championship courses.'),
  supplemental('new-south-wales-golf-club', 'New South Wales Golf Club', 'La Perouse', 'Sydney', 'NSW', [151.2492, -33.989], '18', 'Private club', 5, 'https://www.nswgolfclub.com.au/', '', 'Championship links-style course at La Perouse.'),
  supplemental('brisbane-golf-club', 'Brisbane Golf Club', 'Yeerongpilly', 'Brisbane', 'QLD', [153.0022, -27.5284], '18', 'Private club', 4, 'https://www.brisbanegolfclub.com.au/', '', 'Private club course in Yeerongpilly, Brisbane.'),
  supplemental('sanctuary-cove-golf-and-country-club', 'Sanctuary Cove Golf and Country Club', 'Hope Island', 'Gold Coast', 'QLD', [153.3622, -27.8533], '36', 'Private club', 5, 'https://www.sanctuarycovegolf.com.au/', '', 'Gold Coast country club with The Pines and The Palms courses.'),
  supplemental('woodford-golf-club-qld', 'Woodford Golf Club', 'Woodford', 'Moreton Bay', 'QLD', [152.791265, -26.950042], '18', 'Public access', 2, '', '', '18-hole golf course in Woodford, Queensland. No dedicated club website found yet.', 'https://www.openstreetmap.org/way/131822526'),
  supplemental('noosa-springs-golf-and-spa-resort', 'Noosa Springs Golf and Spa Resort', 'Noosa Heads', 'Sunshine Coast', 'QLD', [153.1044, -26.4191], '18', 'Golf resort', 5, 'https://www.noosasprings.com.au/', '', 'Resort course in Noosa Heads on the Sunshine Coast.'),
  supplemental('maleny-golf-club', 'Maleny Golf Club', 'North Maleny', 'Sunshine Coast', 'QLD', [152.866454, -26.762718], '18', 'Public access', 3, 'https://www.malenygolfclub.com.au/', 'https://malenygc.miclub.com.au/cms/public-bookings/', '18-hole par 69 public-access course at 15 Porters Lane, North Maleny.', 'https://www.malenygolfclub.com.au/'),
  supplemental('hamilton-island-golf-club', 'Hamilton Island Golf Club', 'Dent Island', 'Whitsundays', 'QLD', [148.9462, -20.3476], '18', 'Golf club', 5, 'https://www.hamiltonislandgolfclub.com.au/', '', 'Island golf course on Dent Island in the Whitsundays.'),
  supplemental('links-lady-bay-golf-course', 'Links Lady Bay Golf Course', 'Normanville', 'Fleurieu Peninsula', 'SA', [138.3117, -35.4517], '18', 'Golf course', 4, 'https://www.linksladybay.com.au/', '', 'Links-style course at Normanville on the Fleurieu Peninsula.'),
  supplemental('ocean-dunes-golf-course', 'Ocean Dunes Golf Course', 'Currie', 'King Island', 'TAS', [143.847579, -39.896519], '18', 'Golf course', 5, 'https://oceandunes.com.au/', '', 'Coastal links course on King Island.'),
  supplemental('st-andrews-beach-golf-course', 'St Andrews Beach Golf Course', 'Fingal', 'Mornington Peninsula', 'VIC', [144.8249, -38.4149], '18', 'Public access', 4, 'https://standrewsbeachgolf.com.au/', '', 'Public access course on the Mornington Peninsula.'),
  supplemental('the-vines-resort-golf-club', 'The Vines Resort Golf Club', 'The Vines', 'Swan Valley', 'WA', [116.0065, -31.7544], '36', 'Golf resort', 4, 'https://www.vines.com.au/', '', 'Resort golf club in the Swan Valley.')
];

async function main() {
  const imported = await fetchStateElements();
  if (imported.length <= 1000) {
    throw new Error(`OpenStreetMap import returned only ${imported.length} state-tagged features; refusing to deploy incomplete data.`);
  }

  const generated = imported.map((record) => fromOverpass(record.element, record.state)).filter(Boolean);
  const merged = mergeSupplementals(generated, supplementalCourses);
  const deduped = dedupe(merged).sort((a, b) => a.state.localeCompare(b.state) || a.name.localeCompare(b.name));
  const output = '// Generated by scripts/build-pages-data.mjs from OpenStreetMap/Overpass state boundary imports plus verified supplements.\nwindow.GOLF_COURSES = ' + JSON.stringify(deduped, null, 2) + ';\n';
  fs.writeFileSync('courses.js', output, 'utf8');
  console.log(`Generated ${deduped.length} courses from ${imported.length} imported OSM features`);
}

async function fetchStateElements() {
  const imported = [];
  const failures = [];

  await runWithConcurrency(stateAreas, importConcurrency, async (state) => {
    try {
      const elements = await fetchOneState(state);
      elements.forEach((element) => imported.push({ element, state }));
    } catch (error) {
      failures.push(`${state.code}: ${error && error.message ? error.message : error}`);
    }
  });

  if (failures.length) {
    throw new Error('State imports failed: ' + failures.join(' | '));
  }

  return imported;
}

async function runWithConcurrency(items, limit, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index]);
    }
  });
  await Promise.all(workers);
}

async function fetchOneState(state) {
  const query = stateQuery(state.iso);
  const errors = [];

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
      if (elements.length > 0) {
        console.log(`Imported ${elements.length} ${state.code} features from ${endpoint}`);
        return elements;
      }
      throw new Error(`${endpoint} returned no ${state.code} elements`);
    } catch (error) {
      errors.push(String(error && error.message ? error.message : error));
    }
  }

  throw new Error(errors.join('; '));
}

function stateQuery(isoCode) {
  return `[out:json][timeout:180];
area["ISO3166-2"="${isoCode}"][admin_level=4]->.stateArea;
(
  node["leisure"="golf_course"](area.stateArea);
  way["leisure"="golf_course"](area.stateArea);
  relation["leisure"="golf_course"](area.stateArea);
);
out center tags;`;
}

function fromOverpass(element, stateContext) {
  const tags = element.tags || {};
  const lon = Number(element.lon ?? element.center?.lon);
  const lat = Number(element.lat ?? element.center?.lat);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;

  const rawName = clean(tags.name || tags.official_name || tags.short_name);
  if (!rawName) return null;
  if (!isCourseLike(tags, rawName)) return null;

  const sourceId = sourceIdFor(element);
  const state = clean(stateContext?.code || normaliseState(tags['addr:state']) || inferState(lon, lat));
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
    if (!override.imageUrl) {
      course.imageUrl = course.homepageUrl ? favicon(course.homepageUrl) : aerial;
      course.mediaKind = course.homepageUrl ? 'logo' : 'photo';
    }
    course.summary = override.summary || summary(tags, course.town, course.region, course.state);
    course.imageAlt = `${course.name} ${course.mediaKind === 'logo' ? 'logo' : 'aerial course image'}`;
  }

  return course;
}

function supplemental(id, name, town, region, state, coordinates, holes, access, priceLevel, homepageUrl, bookingUrl, summaryText, sourceUrl = '') {
  const fallback = aerialTile(coordinates);
  const hasWebsite = Boolean(homepageUrl);
  return {
    id,
    name,
    town,
    region,
    state,
    coordinates,
    holes,
    access,
    priceLevel,
    homepageUrl,
    bookingUrl,
    imageUrl: hasWebsite ? favicon(homepageUrl) : fallback,
    fallbackImageUrl: fallback,
    imageAlt: `${name} ${hasWebsite ? 'logo' : 'aerial course image'}`,
    mediaKind: hasWebsite ? 'logo' : 'photo',
    summary: summaryText,
    source: 'Verified supplemental course',
    sourceId: `supplemental-${id}`,
    sourceUrl,
    webSearchUrl: webSearchUrl(name, town, state)
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

function isCourseLike(tags, name) {
  const leisure = String(tags.leisure || '').toLowerCase();
  const sport = String(tags.sport || '').toLowerCase();
  const golf = String(tags.golf || '').toLowerCase();
  if (['hole', 'tee', 'green', 'fairway', 'bunker', 'water_hazard', 'driving_range'].includes(golf)) return false;
  if (leisure === 'golf_course' || golf === 'course') return true;
  return sport === 'golf' && /golf|links|country club|resort|course|club|dunes/i.test(name);
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
  return aliases[text] || (stateCodes.includes(text) ? text : '');
}

function inferState(lon, lat) {
  if (lon >= 148.75 && lon <= 149.45 && lat >= -35.95 && lat <= -35.1) return 'ACT';
  if (lat < -39) return 'TAS';
  if (lon < 129) return 'WA';
  if (lon >= 129 && lon < 138) return lat > -26 ? 'NT' : 'SA';
  if (lon >= 138 && lon < 141) return lat > -29 ? 'QLD' : 'SA';
  if (lon >= 141 && lon < 144) return lat > -29 ? 'QLD' : lat > -36 ? 'NSW' : 'VIC';
  if (lon >= 144 && lon < 150) return lat > -29 ? 'QLD' : lat > -37 ? 'NSW' : 'VIC';
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
