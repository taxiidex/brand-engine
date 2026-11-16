import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { downloadImage } from '@gitroom/nestjs-libraries/render/remote.image';
import {
  StockOrientation,
  StockPhoto,
  StockProvider,
  StockVideo,
} from '@gitroom/nestjs-libraries/stock/stock.provider';
import { PexelsProvider } from '@gitroom/nestjs-libraries/stock/pexels.provider';
import { PixabayProvider } from '@gitroom/nestjs-libraries/stock/pixabay.provider';

export type { StockOrientation, StockPhoto, StockVideo };

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
// downloaded clips stay on disk this long
const CLIP_CACHE_MS = 30 * 60 * 1000;
const CLIP_DIR = join(tmpdir(), 'brand-clips');
// Pixabay's terms ask for 24 hours, and stock searches rarely change
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 300;
// a picked photo is used again for every preview, so it is kept for a while
const PHOTO_CACHE_MS = 10 * 60 * 1000;
const PHOTO_CACHE_MAX = 8;

// Free stock photos from every provider that has a key. Searches are cached
// so a repeated search never counts against a provider's rate limit.
@Injectable()
export class StockService {
  private readonly _providers: StockProvider[] = [
    new PexelsProvider(),
    new PixabayProvider(),
  ];
  private readonly _cache = new Map<
    string,
    { at: number; photos: StockPhoto[] }
  >();
  private readonly _photos = new Map<string, { at: number; image: Buffer }>();
  private readonly _videoCache = new Map<
    string,
    { at: number; videos: StockVideo[] }
  >();

  isConfigured() {
    return this._providers.some((p) => p.isConfigured());
  }

  async search(
    query: string,
    orientation: StockOrientation,
    perPage = 12
  ): Promise<StockPhoto[]> {
    const term = query.replace(/\s+/g, ' ').trim();
    const active = this._providers.filter((p) => p.isConfigured());
    if (!term || !active.length) {
      return [];
    }

    const cacheKey = `${active.map((p) => p.label).join('+')}|${orientation}|${perPage}|${term.toLowerCase()}`;
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.photos;
    }

    const results = await Promise.all(
      active.map((p) => p.search(term, orientation, perPage))
    );
    // alternate between providers so the choice is not one source only
    const photos: StockPhoto[] = [];
    for (let i = 0; photos.length < perPage; i++) {
      const round = results.map((r) => r[i]).filter(Boolean);
      if (!round.length) {
        break;
      }
      photos.push(...round);
    }
    const merged = photos.slice(0, perPage);

    // an empty answer is most likely a failure or a rate limit, do not keep it
    if (merged.length) {
      if (this._cache.size >= CACHE_MAX) {
        this._cache.delete(this._cache.keys().next().value!);
      }
      this._cache.set(cacheKey, { at: Date.now(), photos: merged });
    }
    return merged;
  }

  async searchVideos(
    query: string,
    orientation: StockOrientation,
    perPage = 8
  ): Promise<StockVideo[]> {
    const term = query.replace(/\s+/g, ' ').trim();
    const active = this._providers.filter((p) => p.isConfigured());
    if (!term || !active.length) {
      return [];
    }

    const cacheKey = `${active
      .map((p) => p.label)
      .join('+')}|video|${orientation}|${perPage}|${term.toLowerCase()}`;
    const cached = this._videoCache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.videos;
    }

    const results = await Promise.all(
      active.map((p) => p.searchVideos(term, orientation, perPage))
    );
    const videos: StockVideo[] = [];
    for (let i = 0; videos.length < perPage; i++) {
      const round = results.map((r) => r[i]).filter(Boolean);
      if (!round.length) {
        break;
      }
      videos.push(...round);
    }
    const merged = videos.slice(0, perPage);

    if (merged.length) {
      if (this._videoCache.size >= CACHE_MAX) {
        this._videoCache.delete(this._videoCache.keys().next().value!);
      }
      this._videoCache.set(cacheKey, { at: Date.now(), videos: merged });
    }
    return merged;
  }

  // Only clips that live on a provider's own host are ever downloaded
  async downloadVideo(url: string) {
    const file = join(CLIP_DIR, `${createHash('sha1').update(url).digest('hex')}.mp4`);
    try {
      const info = await stat(file);
      if (Date.now() - info.mtimeMs < CLIP_CACHE_MS) {
        return await readFile(file);
      }
    } catch (err) {
      // not downloaded yet
    }
    const clip = await downloadImage(
      url,
      MAX_VIDEO_BYTES,
      this._providers.flatMap((p) => p.hosts)
    );
    if (clip) {
      try {
        await mkdir(CLIP_DIR, { recursive: true });
        await writeFile(file, clip);
        // forget clips older than the cache time
        for (const name of await readdir(CLIP_DIR)) {
          const old = join(CLIP_DIR, name);
          if (Date.now() - (await stat(old)).mtimeMs > CLIP_CACHE_MS) {
            await rm(old, { force: true });
          }
        }
      } catch (err) {
        // the cache is only a speed-up
      }
    }
    return clip;
  }

  // Only photos that live on a provider's own image host are ever downloaded
  async download(url: string) {
    const cached = this._photos.get(url);
    if (cached && Date.now() - cached.at < PHOTO_CACHE_MS) {
      return cached.image;
    }

    const image = await downloadImage(
      url,
      MAX_PHOTO_BYTES,
      this._providers.flatMap((p) => p.hosts)
    );
    if (image) {
      if (this._photos.size >= PHOTO_CACHE_MAX) {
        this._photos.delete(this._photos.keys().next().value!);
      }
      this._photos.set(url, { at: Date.now(), image });
    }
    return image;
  }
}
