import fs from 'fs/promises';

async function main() {
  const detail = JSON.parse(await fs.readFile('test/film_detail_structure.json', 'utf-8'));
  const parts = detail.parts;
  
  if (!parts) {
    console.log('No parts found in filmDetail');
    return;
  }

  console.log('Keys in parts:', Object.keys(parts));
  
  // parts.info
  if (parts.info) {
    console.log('parts.info:', JSON.stringify(parts.info).substring(0, 500));
  }
  
  // parts.season
  if (parts.season) {
    console.log('parts.season (isArray):', Array.isArray(parts.season));
    console.log('parts.season:', JSON.stringify(parts.season).substring(0, 500));
  }

  // parts.content
  if (parts.content) {
    console.log('parts.content (isArray):', Array.isArray(parts.content));
    console.log('parts.content length:', parts.content.length);
    if (parts.content.length > 0) {
      console.log('Sample item in parts.content:', JSON.stringify(parts.content[0], null, 2));
    }
  }

  // Let's extract the list of episodes, their titles, and URLs!
  // An episode url on TV360 has the form: https://tv360.vn/movie/[slug]-tap-[N]-[code]?m=[movie_id]&e=[episode_id]
  const film = detail.film;
  const filmSlug = film?.slug;
  const filmId = film?.id;

  console.log(`Film slug: ${filmSlug}, Film ID: ${filmId}`);

  if (parts.content && Array.isArray(parts.content)) {
    console.log('\nExtracted Episode List:');
    parts.content.forEach((item, index) => {
      // The URL format: /movie/[slug]-tap-[N]-[item.id]?m=[filmId]&e=[item.id]
      // Let's see how TV360 links to the episode
      const epUrl = `https://tv360.vn/movie/${item.slug || filmSlug}-tap-${item.position || index + 1}-${item.id}?m=${filmId}&e=${item.id}`;
      console.log(`${index + 1}: ${item.name || item.title || ('Tập ' + (item.position || index + 1))} -> ${epUrl}`);
    });
  }
}

main().catch(console.error);
