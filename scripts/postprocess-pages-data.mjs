import fs from 'node:fs';

const input = fs.readFileSync('courses.js', 'utf8');
const match = input.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
if (!match) {
  throw new Error('Could not parse generated courses.js');
}

const courses = JSON.parse(match[1]);
const cleaned = [];
const sourceIds = new Set(courses.map((course) => course.sourceId).filter(Boolean));
const stateNames = new Set([
  'act',
  'australian capital territory',
  'nsw',
  'new south wales',
  'nt',
  'northern territory',
  'qld',
  'queensland',
  'sa',
  'south australia',
  'tas',
  'tasmania',
  'vic',
  'victoria',
  'wa',
  'western australia'
]);

const supplementalReplacementSourceIds = {
  'supplemental-bonville-golf-resort': 'osm-way-784365355',
  'supplemental-new-south-wales-golf-club': 'osm-relation-3045927',
  'supplemental-riverside-oaks-golf-resort': 'osm-node-136441888',
  'supplemental-brisbane-golf-club': 'osm-way-16293350',
  'supplemental-noosa-springs-golf-and-spa-resort': 'osm-way-193853562',
  'supplemental-ocean-dunes-golf-course': 'osm-way-1177334990',
  'supplemental-st-andrews-beach-golf-course': 'osm-way-242200104',
  'supplemental-the-vines-resort-golf-club': 'osm-relation-1249371'
};

const mappedCourseOverrides = {
  'osm-way-784365355': {
    id: 'bonville-golf-resort',
    name: 'Bonville Golf Resort',
    town: 'Bonville',
    region: 'Coffs Coast',
    state: 'NSW',
    holes: '18',
    access: 'Golf resort',
    priceLevel: 5,
    homepageUrl: 'https://www.bonvillegolf.com.au/',
    summary: 'Destination golf resort near Coffs Harbour.',
    aliases: ['Bonville International Golf Club']
  },
  'osm-relation-3045927': {
    id: 'new-south-wales-golf-club',
    name: 'New South Wales Golf Club',
    town: 'La Perouse',
    region: 'Sydney',
    state: 'NSW',
    holes: '18',
    access: 'Private club',
    priceLevel: 5,
    homepageUrl: 'https://www.nswgolfclub.com.au/',
    summary: 'Championship links-style course at La Perouse.',
    aliases: ['NSW Golf Club']
  },
  'osm-node-136441888': {
    id: 'riverside-oaks-golf-resort',
    name: 'Riverside Oaks Golf Resort',
    town: 'Cattai',
    region: 'Hawkesbury',
    state: 'NSW',
    holes: '36',
    access: 'Golf resort',
    priceLevel: 4,
    homepageUrl: 'https://www.riversideoaks.com.au/',
    summary: 'Golf resort on the Hawkesbury River with two championship courses.',
    aliases: ['Riverside Oaks Golf Club']
  },
  'osm-way-16293350': {
    id: 'brisbane-golf-club',
    name: 'Brisbane Golf Club',
    town: 'Yeerongpilly',
    region: 'Brisbane',
    state: 'QLD',
    holes: '18',
    access: 'Private club',
    priceLevel: 4,
    homepageUrl: 'https://www.brisbanegolfclub.com.au/',
    summary: 'Private club course in Yeerongpilly, Brisbane.',
    aliases: ['The Brisbane Golf Club Inc.']
  },
  'osm-way-193853562': {
    id: 'noosa-springs-golf-and-spa-resort',
    name: 'Noosa Springs Golf and Spa Resort',
    town: 'Noosa Heads',
    region: 'Sunshine Coast',
    state: 'QLD',
    holes: '18',
    access: 'Golf resort',
    priceLevel: 5,
    homepageUrl: 'https://www.noosasprings.com.au/',
    summary: 'Resort course in Noosa Heads on the Sunshine Coast.',
    aliases: ['Noosa Springs']
  },
  'osm-way-1177334990': {
    id: 'ocean-dunes-golf-course',
    name: 'Ocean Dunes Golf Course',
    town: 'Currie',
    region: 'King Island',
    state: 'TAS',
    holes: '18',
    access: 'Golf course',
    priceLevel: 5,
    homepageUrl: 'https://oceandunes.com.au/',
    summary: 'Coastal links course on King Island.',
    aliases: ['Ocean Dunes Golf Course King Island']
  },
  'osm-way-242200104': {
    id: 'st-andrews-beach-golf-course',
    name: 'St Andrews Beach Golf Course',
    town: 'Fingal',
    region: 'Mornington Peninsula',
    state: 'VIC',
    holes: '18',
    access: 'Public access',
    priceLevel: 4,
    homepageUrl: 'https://standrewsbeachgolf.com.au/',
    bookingUrl: 'https://standrews.miclub.com.au/cms/public-bookings/',
    summary: 'Public access course at 209 Sandy Rd, Fingal on the Mornington Peninsula.',
    aliases: ['Saint Andrews Beach Golf Club']
  },
  'osm-relation-1249371': {
    id: 'the-vines-resort-golf-club',
    name: 'The Vines Resort Golf Club',
    town: 'The Vines',
    region: 'Swan Valley',
    state: 'WA',
    holes: '36',
    access: 'Golf resort',
    priceLevel: 4,
    homepageUrl: 'https://www.vines.com.au/',
    summary: 'Resort golf club in the Swan Valley.',
    aliases: ['The Vines Golf Course']
  }
};

for (const originalCourse of courses) {
  if (isKnownRetailNotCourse(originalCourse)) continue;
  if (isUnnamedGeneratedCourse(originalCourse)) continue;
  if (shouldDropSupplementalDuplicate(originalCourse)) continue;

  const course = improveLocationLabels(applyMappedCourseOverride(originalCourse));
  const index = cleaned.findIndex((existing) => isDuplicateCourse(existing, course));
  if (index === -1) {
    cleaned.push(course);
  } else {
    cleaned[index] = preferCourse(cleaned[index], course);
  }
}

const output = '// Generated by scripts/build-pages-data.mjs from OpenStreetMap/Overpass plus verified supplements. Cleaned by scripts/postprocess-pages-data.mjs.\nwindow.GOLF_COURSES = ' + JSON.stringify(cleaned, null, 2) + ';\n';
fs.writeFileSync('courses.js', output, 'utf8');
console.log(`Cleaned generated course data: ${courses.length} -> ${cleaned.length}`);

function shouldDropSupplementalDuplicate(course) {
  const replacementSourceId = supplementalReplacementSourceIds[course.sourceId];
  return Boolean(replacementSourceId && sourceIds.has(replacementSourceId));
}

function applyMappedCourseOverride(course) {
  const override = mappedCourseOverrides[course.sourceId];
  if (!override) return course;

  const aliases = unique([...(course.aliases || []), course.name, ...(override.aliases || [])]);
  const next = {
    ...course,
    ...override,
    aliases: aliases.filter((alias) => alias && alias !== override.name),
    source: course.source || 'OpenStreetMap',
    sourceUrl: course.sourceUrl || '',
    fallbackImageUrl: course.fallbackImageUrl || '',
    webSearchUrl: webSearchUrl(override.name, override.town, override.state)
  };

  if (isWeakMedia(next.imageUrl)) {
    next.imageUrl = next.fallbackImageUrl || next.imageUrl || '';
    next.mediaKind = next.fallbackImageUrl ? 'photo' : next.mediaKind;
  }
  next.imageAlt = `${next.name} ${next.mediaKind === 'logo' ? 'logo' : 'aerial course image'}`;
  return next;
}

function improveLocationLabels(course) {
  const next = { ...course };

  if (isWeakPlace(next.town)) {
    next.town = '';
  }

  if (isWeakPlace(next.region)) {
    next.region = '';
  }

  next.summary = cleanSummary(next.summary, next);

  next.webSearchUrl = webSearchUrl(next.name, next.town || next.region || next.state, next.state);
  return next;
}

function cleanSummary(value, course) {
  const summary = String(value || '').trim();
  const generic = genericSummary(course);
  if (!summary || /^Golf course in /i.test(summary)) return generic;
  return summary.replace(/Golf course in [A-Z]{2,3}, [A-Z]{2,3}, [A-Z]{2,3}\./g, generic);
}

function genericSummary(course) {
  const place = locationParts(course).join(', ');
  return place ? `Golf course in ${place}.` : 'Golf course in Australia.';
}

function locationParts(course) {
  const seen = new Set();
  return [course.town, course.region, course.state].filter((part) => {
    const value = String(part || '').trim();
    const key = normaliseName(value);
    if (!value || value === 'Australia' || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isWeakPlace(value) {
  const place = String(value || '').trim();
  return !place || place === 'Australia' || isStateName(place);
}

function isStateName(value) {
  return stateNames.has(normaliseName(value));
}

function isWeakMedia(value) {
  const url = String(value || '');
  return !url || /icons\.duckduckgo\.com|course-placeholder|course-photo-fallback/.test(url);
}

function isDuplicateCourse(a, b) {
  if (a.sourceId && b.sourceId && a.sourceId === b.sourceId) return true;
  if (normaliseName(a.name) !== normaliseName(b.name)) return false;
  if ((a.state || '') !== (b.state || '')) return false;
  return distanceKm(a.coordinates, b.coordinates) <= 3;
}

function preferCourse(a, b) {
  return scoreCourse(b) > scoreCourse(a) ? mergeCourse(b, a) : mergeCourse(a, b);
}

function mergeCourse(primary, secondary) {
  return {
    ...secondary,
    ...primary,
    aliases: unique([...(primary.aliases || []), ...(secondary.aliases || [])]),
    homepageUrl: primary.homepageUrl || secondary.homepageUrl || '',
    bookingUrl: primary.bookingUrl || secondary.bookingUrl || '',
    imageUrl: primary.imageUrl || secondary.imageUrl || '',
    fallbackImageUrl: primary.fallbackImageUrl || secondary.fallbackImageUrl || '',
    sourceUrl: primary.sourceUrl || secondary.sourceUrl || ''
  };
}

function scoreCourse(course) {
  let score = 0;
  if (/^supplemental-/.test(course.sourceId || '')) score += 50;
  if (mappedCourseOverrides[course.sourceId]) score += 45;
  if (course.town && course.town !== course.state && course.town !== 'Australia') score += 20;
  if (course.homepageUrl) score += 15;
  if (course.bookingUrl) score += 10;
  if (course.holes) score += 8;
  if (course.sourceId && course.sourceId.includes('relation')) score += 6;
  if (course.sourceId && course.sourceId.includes('way')) score += 4;
  if (course.summary && !/^Golf course in /.test(course.summary)) score += 4;
  return score;
}

function isKnownRetailNotCourse(course) {
  const name = normaliseName(course.name);
  return name === 'drummond golf' || name === 'golf world';
}

function isUnnamedGeneratedCourse(course) {
  return /^Golf Course near\b/i.test(String(course.name || ''));
}

function normaliseName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/saint/g, 'st')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function distanceKm(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  const earthRadius = 6371;
  const dLat = toRadians(Number(b[1]) - Number(a[1]));
  const dLon = toRadians(Number(b[0]) - Number(a[0]));
  const lat1 = toRadians(Number(a[1]));
  const lat2 = toRadians(Number(b[1]));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function webSearchUrl(name, town, state) {
  return 'https://www.google.com/search?q=' + encodeURIComponent(`${name} ${town} ${state} golf club website`);
}
