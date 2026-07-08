import fs from 'fs/promises';

async function main() {
  const html = await fs.readFile('test/demo.html', 'utf-8');
  
  // Find tags containing "1482985"
  const tagRegex = /<[^>]+1482985[^>]+>/g;
  const matches = html.match(tagRegex) || [];
  
  console.log(`Found ${matches.length} tags containing '1482985':`);
  matches.slice(0, 15).forEach((tag, idx) => {
    console.log(`${idx + 1}: ${tag}`);
  });
}

main().catch(console.error);
