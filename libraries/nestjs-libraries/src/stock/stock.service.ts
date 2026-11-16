import { Injectable } from '@nestjs/common';
import { downloadImage } from '@gitroom/nestjs-libraries/render/remote.image';
import {
  StockOrientation,
  StockPhoto,
  StockProvider,
} from '@gitroom/nestjs-libraries/stock/stock.provider';
import { PexelsProvider } from '@gitroom/nestjs-libraries/stock/pexels.provider';
import { PixabayProvider } from '@gitroom/nestjs-libraries/stock/pixabay.provider';

export type { StockOrientation, StockPhoto };

const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
// Pixabay's terms ask for 24 hours, and stock searches rarely change
const CACHE_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX = 300;

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

  // Only photos that live on a provider's own image host are ever downloaded
  download(url: string) {
    return downloadImage(
      url,
      MAX_PHOTO_BYTES,
      this._providers.flatMap((p) => p.hosts)
    );
  }
}
