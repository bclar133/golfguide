import fs from 'node:fs';

const publishedCoursesUrl = 'https://bclar133.github.io/golfguide/courses.js';
const userAgent = 'AussieGolfGuide/0.5 (github.com/bclar133/golfguide)';

async function main() {
  const committedCourses = readCommittedCourses();
  if (committedCourses.length > 1000) {
    console.log(`Using committed courses.js with ${committedCourses.length} courses`);
    return;
  }

  const courses = await fetchPublishedCourses();
  if (courses.length <= 1000) {
    throw new Error(`Published course seed returned only ${courses.length} courses.`);
  }

  const output = '// Seeded by scripts/build-pages-data.mjs from the last published GitHub Pages course data. Cleaned by scripts/postprocess-pages-data.mjs.\nwindow.GOLF_COURSES = ' + JSON.stringify(courses, null, 2) + ';\n';
  fs.writeFileSync('courses.js', output, 'utf8');
  console.log(`Seeded ${courses.length} courses from published course data`);
}

function readCommittedCourses() {
  if (!fs.existsSync('courses.js')) return [];
  const text = fs.readFileSync('courses.js', 'utf8');
  const match = text.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
  if (!match) return [];
  try {
    return JSON.parse(match[1]).filter((course) => !/^Golf Course near\b/i.test(String(course.name || '')));
  } catch {
    return [];
  }
}

async function fetchPublishedCourses() {
  const response = await fetch(`${publishedCoursesUrl}?v=${Date.now()}`, {
    headers: {
      'cache-control': 'no-cache',
      'user-agent': userAgent
    }
  });
  if (!response.ok) {
    throw new Error(`Published course seed returned HTTP ${response.status}`);
  }

  const text = await response.text();
  const match = text.match(/window\.GOLF_COURSES\s*=\s*([\s\S]*);\s*$/);
  if (!match) {
    throw new Error('Could not parse published course seed.');
  }

  return JSON.parse(match[1]).filter((course) => !/^Golf Course near\b/i.test(String(course.name || '')));
}

await main();
