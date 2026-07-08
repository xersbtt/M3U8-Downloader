import fs from 'fs/promises';

async function main() {
  const html = await fs.readFile('test/demo.html', 'utf-8');
  
  // Find all buttons
  const buttons = [];
  const btnRegex = /<button\s+([^>]*?)>([\s\S]*?)<\/button>/gi;
  let match;
  while ((match = btnRegex.exec(html)) !== null) {
    buttons.push({ attrs: match[1], content: match[2].replace(/<[^>]+>/g, '').trim() });
  }

  console.log(`Found ${buttons.length} button tags:`);
  buttons.forEach((btn, idx) => {
    console.log(`${idx + 1}: Attrs: [${btn.attrs}] | Content: [${btn.content}]`);
  });
}

main().catch(console.error);
