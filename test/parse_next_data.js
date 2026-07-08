import fs from 'fs/promises';

async function main() {
  const data = JSON.parse(await fs.readFile('test/next_data.json', 'utf-8'));
  const filmDetail = data.props?.pageProps?.filmDetail;
  if (!filmDetail) {
    console.log('No filmDetail found in next_data.json');
    return;
  }

  console.log('Keys in filmDetail:', Object.keys(filmDetail));
  console.log('Film Title:', filmDetail.name);
  console.log('Film Slug:', filmDetail.slug);
  console.log('Film ID (m):', filmDetail.id);

  // Let's search for lists or arrays inside filmDetail that might contain episodes
  for (const [key, val] of Object.entries(filmDetail)) {
    if (Array.isArray(val)) {
      console.log(`Array key: "${key}" (length: ${val.length})`);
      if (val.length > 0) {
        console.log(`Sample item in "${key}":`, JSON.stringify(val[0]).substring(0, 200));
      }
    } else if (typeof val === 'object' && val !== null) {
      console.log(`Object key: "${key}" (keys: ${Object.keys(val).join(', ')})`);
      // check if it has episodes
      if (val.episodes || val.listEpisode || val.list) {
        console.log(`  Sub-key matches episode!`);
      }
    }
  }

  // Let's dump the entire filmDetail keys and structures to a file
  await fs.writeFile('test/film_detail_structure.json', JSON.stringify(filmDetail, null, 2));
  console.log('Saved filmDetail structure to test/film_detail_structure.json');
}

main().catch(console.error);
