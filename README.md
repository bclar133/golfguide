# Aussie Golf Guide

A web-and-phone-friendly prototype for finding golf courses around Australia.

## What is included

- MapLibre map using OpenFreeMap tiles, with no API key required.
- Satellite view toggle using Esri World Imagery raster tiles for the prototype.
- Search by course, town, travel region, state, access type, or notes.
- Filters for state and a relative $$ to $$$$$ price guide.
- Golf ball markers on the map.
- Grass-textured UI treatment with a distinctive Bricolage Grotesque font.
- Australia-shaped golf ball favicon and refined dimpled golf ball map markers.
- Top100 Golf Courses Australia ranking badges and links for matched courses.
- Clustered golf balls with counts when multiple courses are close together at low zoom.
- Hover and click popups with course details.
- Course details with homepage and optional direct booking links.
- 1,520 current course records across ACT, NSW, NT, QLD, SA, TAS, VIC, and WA.
- Best-effort course logo loading from each course website favicon, with a local fallback image if the site image fails.
- PWA manifest and service worker so the same app can be installed from a mobile browser once hosted over HTTPS.
- Capacitor config as a starting point for wrapping the same app as native iOS/Android later.

## Running it

Open index.html in a browser for the simplest local preview.

For full phone/PWA behavior, host the folder through any static web server over HTTPS. Service workers and install prompts do not run from a file URL.

## Course data

Course records live in courses.js. Each course supports these fields:

    {
      name: "Course name",
      town: "Town",
      region: "Region",
      state: "State",
      coordinates: [longitude, latitude],
      holes: "18",
      access: "Public access",
      priceLevel: 3,
      homepageUrl: "https://example.com/",
      bookingUrl: "https://example.com/book/",
      imageUrl: "https://example.com/favicon.ico",
      mediaKind: "logo"
    }

The starter data is still seed data. For production, import OpenStreetMap leisure=golf_course records into a database, then enrich each course with verified website, booking, price, logo, and photo fields.

## Map stack

- Map renderer: MapLibre GL JS
- Map tile provider: OpenFreeMap
- Satellite tile provider: Esri World Imagery
- Data source path: OpenStreetMap import plus manual enrichment

OpenFreeMap does not require registration or an API key, but a production app should still keep the tile/style URL configurable so the provider can be changed later if needed.

## Satellite view

Satellite imagery is not part of OpenStreetMap itself. This prototype uses Esri World Imagery as a no-key raster imagery layer under the same MapLibre map. Before public launch or high-volume use, confirm the imagery provider terms or swap the URL for a paid/free-tier provider you are comfortable with.

## Coverage audit

Use COURSE_AUDIT_CHECKLIST.md to compare the app data against independent national and state golf directories. The current data is broad but should not be treated as complete until every state and territory has been audited.

- Aerial imagery fallback: records without a verified logo/photo use Esri World Imagery centred on the course coordinates until a verified course asset is added; every record also uses a course-specific aerial image as its emergency fallback if the primary asset fails to load.

## Course Media Enrichment

Course logos/photos are enriched with `tools/enrich-course-media.mjs`. The workflow is: official homepage HTML first, direct logo/photo download when possible, browser screenshot crop as fallback, then aerial imagery only when no verified page asset is available. Each run writes a JSON report to `course-media-reports/` so bad matches can be reviewed.

Example targeted run inside the bundled workspace runtime:

```
--only marysville --write --force
```

Current audit counters live in `course-data-audit.json`; the important ones are `usingFaviconLogo`, `usingLocalCourseMedia`, `missingOfficialWebsite`, and `usingAerialImageFallback`.
