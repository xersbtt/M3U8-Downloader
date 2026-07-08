import { BrowserHelper } from '../src/browser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const config = {
    user_data_dir: "./user_data_test",
    sites: {
      default: {
        episode_selector: "a[href*='/movie/']",
        play_button_selector: "button"
      }
    }
  };

  const helper = new BrowserHelper(config);
  await helper.initBrowser(true); // Headless for testing

  const fileUrl = `file://${path.resolve(__dirname, 'demo.html').replace(/\\/g, '/')}`;
  console.log('Navigating to local test page:', fileUrl);

  try {
    const episodes = await helper.scrapeEpisodes(fileUrl);
    console.log(`\n--- RESULT ---`);
    console.log(`Found ${episodes.length} episodes:`);
    episodes.forEach((ep, idx) => {
      console.log(`${idx + 1}. ${ep.title} -> ${ep.url}`);
    });
  } catch (error) {
    console.error('Error during scraping:', error);
  } finally {
    await helper.close();
  }
}

main().catch(console.error);
