import { Injectable, Logger } from '@nestjs/common';
import { downloadImage } from '@gitroom/nestjs-libraries/render/remote.image';

export interface StockPhoto {
  id: string;
  provider: 'pexels';
  thumb: string;
  url: string;
  width: number;
  height: number;
  credit: { name: string; link: string };
}

export type StockOrientation = 'portrait' | 'landscape' | 'square';

const PEXELS_HOSTS = ['images.pexels.com'];
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;

// Free stock photos from Pexels. Results are cached for an hour so the same
// search never counts twice against Pexels' hourly limit.
@Injectable()
export class StockService {
  private readonly _logger = new Logger(StockService.name);
  private readonly _cache = new Map<
    string,
    { at: number; photos: StockPhoto[] }
  >();

  isConfigured() {
    return !!process.env.PEXELS_API_KEY;
  }

  async search(
    query: string,
    orientation: StockOrientation,
    perPage = 12
  ): Promise<StockPhoto[]> {
    const key = process.env.PEXELS_API_KEY;
    const term = query.replace(/\s+/g, ' ').trim();
    if (!key || !term) {
      return [];
    }

    const cacheKey = `${orientation}|${perPage}|${term.toLowerCase()}`;
    const cached = this._cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return cached.photos;
    }

    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?${new URLSearchParams({
          query: term,
          orientation,
          per_page: String(perPage),
        })}`,
        {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) {
        this._logger.warn(`Pexels search failed with ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { photos?: any[] };
      const photos: StockPhoto[] = (data.photos || [])
        .filter((p) => p?.src?.large2x && p?.src?.medium)
        .map((p) => ({
          id: String(p.id),
          provider: 'pexels' as const,
          thumb: p.src.medium,
          url: p.src.large2x,
          width: p.width,
          height: p.height,
          credit: {
            name: String(p.photographer || 'Pexels'),
            link: String(p.photographer_url || p.url || 'https://www.pexels.com'),
          },
        }));

      if (this._cache.size >= CACHE_MAX) {
        this._cache.delete(this._cache.keys().next().value!);
      }
      this._cache.set(cacheKey, { at: Date.now(), photos });
      return photos;
    } catch (err) {
      this._logger.warn(`Pexels search error: ${err}`);
      return [];
    }
  }

  // Only photos that live on Pexels' own image host are ever downloaded
  download(url: string) {
    return downloadImage(url, MAX_PHOTO_BYTES, PEXELS_HOSTS);
  }
}
