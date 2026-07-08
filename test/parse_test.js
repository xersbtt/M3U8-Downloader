import fs from 'fs/promises';
// No htmlparser2 import
// Since we don't have external parsers, we can use standard regex on the HTML string!
// That is extremely fast and has no dependencies.

async function main() {
  const html = await fs.readFile('test/demo.html', 'utf-8');
  console.log('HTML Length:', html.length);

  // Let's find all hrefs in <a> tags
  const hrefs = [];
  const aRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = aRegex.exec(html)) !== null) {
    hrefs.push(match[1]);
  }

  console.log(`Found ${hrefs.length} total links in HTML.`);
  
  // Filter for links containing "movie" or "tap" or matching the pattern
  const movieLinks = hrefs.filter(h => h.includes('movie') || h.includes('tap') || h.includes('e=') || h.includes('m='));
  console.log('\nRelevant movie/episode links found:');
  const uniqueMovieLinks = [...new Set(movieLinks)];
  uniqueMovieLinks.forEach((link, idx) => {
    console.log(`${idx + 1}: ${link}`);
  });

  // Let's also check if there is NextJS state (_next or __NEXT_DATA__) in a script tag
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
  if (nextDataMatch) {
    console.log('\nFound __NEXT_DATA__ script block!');
    const nextData = JSON.parse(nextDataMatch[1]);
    await fs.writeFile('test/next_data.json', JSON.stringify(nextData, null, 2));
    console.log('Saved __NEXT_DATA__ to test/next_data.json');
    
    // Let's search inside nextData for query/props related to episodes
    // Often Next.js stores the page props, including lists of episodes!
    if (nextData.props && nextData.props.pageProps) {
      const pageProps = nextData.props.pageProps;
      console.log('Keys in pageProps:', Object.keys(pageProps));
      
      // Let's write a summary of what's inside
      await fs.writeFile('test/page_props_keys.json', JSON.stringify(pageProps, null, 2));
    }
  }
}

main().catch(console.error);
