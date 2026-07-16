# Course Coverage Audit Checklist

Current app baseline: 1517 course records in `courses.js` as at 2026-07-09.

This checklist is for proving coverage, not just adding more pins. The target is to compare the app against independent golf club/course directories, then record every match, possible duplicate, missing course, closure, and non-course facility.

## Source Priority

1. Official national/state bodies and club directories.
2. Official club, council, resort, school, or venue websites.
3. OpenStreetMap geometry for coordinates and course footprint.
4. Public directories only as supporting evidence when an official page is missing.

Known useful sources:

- Golf Australia / GOLF.com.au: https://golf.com.au/
- Golf NSW & ACT club directory: https://www.golfnsw.org.au/nsw-and-act-golf-clubs/
- OpenStreetMap copyright/source: https://www.openstreetmap.org/copyright
- Overpass API for OpenStreetMap extracts: https://overpass-api.de/

## State/Territory Status

| State | Current app records | Audit status | Notes |
| --- | ---: | --- | --- |
| ACT | 9 | Not started | |
| NSW | 542 | Not started | |
| NT | 14 | Not started | |
| QLD | 276 | Not started | |
| SA | 150 | Not started | |
| TAS | 77 | Not started | |
| VIC | 235 | Not started | |
| WA | 214 | Not started | |

## Per-State Audit Steps

- [ ] Export the current app list for the state with name, town, region, coordinates, online-presence URL, booking URL, image URL, source, and source URL.
- [ ] Capture the independent directory list for the state from the best available official source.
- [ ] Normalize names before matching: remove punctuation, lowercase, and compare variants such as Golf Club, Golf Course, Country Club, Links, Resort, and Public Golf Course.
- [ ] Match exact name and town combinations first.
- [ ] Match likely aliases manually, for example club name versus course name, resort name versus golf course name, and town name versus locality name.
- [ ] Check coordinate distance for possible duplicates within the same town or suburb.
- [ ] Classify every source record as one of: matched, missing, possible duplicate, closed, non-course facility, indoor/simulator only, driving range only, or needs manual review.
- [ ] For every missing course candidate, verify it with at least one official or council/source page before adding it.
- [ ] Add verified missing courses to the supplemental data path with source URL and checked date.
- [ ] Add an official online presence where available: club website first, then Facebook page/group, council page, resort/venue page, state golf profile, or credible directory as a last resort.
- [ ] Add booking links where available; otherwise add a targeted web search fallback.
- [ ] Add a logo where a real website exists; otherwise keep a course photo/fallback image.
- [ ] Review map placement at national, state, regional, and close zoom levels.
- [ ] Record any source limitations, such as directories that include indoor venues, social clubs, retired courses, or clubs without a physical course.

## Record Acceptance Criteria

A course should be accepted into the app when it has:

- [ ] A clear course or club name.
- [ ] State and town/locality.
- [ ] Coordinates placed on the course, not just the town centre.
- [ ] At least one source URL.
- [ ] Online presence, booking URL, or targeted web-search fallback.
- [ ] Access/holes/price fields set to best-known values or left intentionally blank when unknown.
- [ ] Logo/photo/fallback image behavior checked.

## Missing Course Workflow

When a user reports a missing course:

- [ ] Search the current app data by course name, town, and nearby towns.
- [ ] Check OpenStreetMap for alternate tags such as `sport=golf`, `golf=hole`, `leisure=pitch`, and named ways without `leisure=golf_course`.
- [ ] Verify the official website, Facebook page/group, booking page, council page, or credible public source.
- [ ] Add the course as a supplemental record if it is absent from the bulk import.
- [ ] Re-test search, selected card, popup link, and marker position.
- [ ] Add the report to the audit notes so repeated gaps reveal source weaknesses.

## Release Gate

Before claiming national coverage:

- [ ] Every state/territory has been compared against an independent directory.
- [ ] All missing candidates have been classified.
- [ ] All accepted missing courses have source links and coordinates.
- [ ] A random sample of at least 20 courses per large state and 10 per smaller territory has been checked on the map.
- [ ] The app states the last audit date and source limitations clearly.
