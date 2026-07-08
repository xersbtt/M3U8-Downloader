import fs from 'fs/promises';
import path from 'path';

const QUEUE_FILE = 'download_status.json';

export class QueueManager {
  constructor() {
    this.filePath = path.resolve(QUEUE_FILE);
    this.queue = [];
  }

  async init() {
    try {
      const data = await fs.readFile(this.filePath, 'utf-8');
      this.queue = JSON.parse(data);

      // Reset any items stuck in 'downloading' (from a previous crash) back to 'pending'
      let resetCount = 0;
      for (const item of this.queue) {
        if (item.status === 'downloading') {
          item.status = 'pending';
          resetCount++;
        }
        // Ensure retry_count field exists on legacy items
        if (item.retry_count === undefined) {
          item.retry_count = 0;
        }
      }
      if (resetCount > 0) {
        console.log(`\x1b[33mReset ${resetCount} stale 'downloading' item(s) back to 'pending'.\x1b[0m`);
        await this.save();
      }
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.queue = [];
        await this.save();
      } else {
        console.error(`\x1b[31mError reading queue file: ${error.message}. Initializing empty queue.\x1b[0m`);
        this.queue = [];
      }
    }
  }

  async save() {
    // Serialize writes: concurrent downloads may call save() simultaneously,
    // and overlapping fs.writeFile calls can corrupt the JSON file.
    this._savePromise = (this._savePromise || Promise.resolve()).then(async () => {
      try {
        await fs.writeFile(this.filePath, JSON.stringify(this.queue, null, 2), 'utf-8');
      } catch (error) {
        console.error(`\x1b[31mError saving queue file: ${error.message}\x1b[0m`);
      }
    });
    return this._savePromise;
  }

  /**
   * Adds new episodes to the queue. Does not overwrite status of existing episodes.
   * @param {Array<{title: string, url: string}>} episodes 
   */
  async addEpisodes(episodes) {
    let addedCount = 0;
    for (const ep of episodes) {
      const exists = this.queue.find(item => item.url === ep.url);
      if (!exists) {
        this.queue.push({
          title: ep.title,
          url: ep.url,
          status: 'pending', // 'pending' | 'success' | 'failed'
          error_reason: null,
          retry_count: 0,
          last_attempt: null,
          added_at: new Date().toISOString()
        });
        addedCount++;
      }
    }
    if (addedCount > 0) {
      await this.save();
    }
    return addedCount;
  }

  /**
   * Get all episodes that need to be downloaded (pending or failed)
   */
  getPendingOrFailed() {
    return this.queue.filter(item => item.status === 'pending' || item.status === 'failed');
  }

  /**
   * Get all episodes in queue
   */
  getAll() {
    return this.queue;
  }

  /**
   * Reset episodes back to 'pending' so they can be downloaded again,
   * regardless of their current status (including 'success').
   * @param {Array<string>} urls
   * @returns {number} number of items reset
   */
  async resetItems(urls) {
    const urlSet = new Set(urls);
    let count = 0;
    for (const item of this.queue) {
      if (urlSet.has(item.url)) {
        item.status = 'pending';
        item.error_reason = null;
        item.retry_count = 0;
        count++;
      }
    }
    if (count > 0) {
      await this.save();
    }
    return count;
  }

  /**
   * Remove episodes from the queue history. Items currently downloading are kept.
   * @param {Array<string>} urls
   * @returns {number} number of items removed
   */
  async removeItems(urls) {
    const urlSet = new Set(urls);
    const before = this.queue.length;
    this.queue = this.queue.filter(item => !urlSet.has(item.url) || item.status === 'downloading');
    const removed = before - this.queue.length;
    if (removed > 0) {
      await this.save();
    }
    return removed;
  }

  /**
   * Clear the entire history. Items currently downloading are kept.
   * @returns {number} number of items removed
   */
  async clearHistory() {
    const before = this.queue.length;
    this.queue = this.queue.filter(item => item.status === 'downloading');
    const removed = before - this.queue.length;
    if (removed > 0) {
      await this.save();
    }
    return removed;
  }

  /**
   * Update the status of an episode by URL
   * @param {string} url 
   * @param {'pending'|'success'|'failed'} status 
   * @param {object} details 
   */
  async updateStatus(url, status, details = {}) {
    const item = this.queue.find(item => item.url === url);
    if (item) {
      item.status = status;
      item.last_attempt = new Date().toISOString();
      if (status === 'failed') {
        item.error_reason = details.error_reason || 'Unknown error';
        item.retry_count = (item.retry_count || 0) + 1;
      } else if (status === 'success') {
        item.error_reason = null;
      }
      if (details.video_url) item.video_url = details.video_url;
      if (details.audio_urls) item.audio_urls = details.audio_urls;
      // Legacy single audio_url support
      if (details.audio_url) item.audio_url = details.audio_url;
      
      await this.save();
    }
  }
}
