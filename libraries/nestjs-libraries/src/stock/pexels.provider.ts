import { Logger } from '@nestjs/common';
import {
  byOrientation,
  StockOrientation,
  StockPhoto,
  StockProvider,
  StockVideo,
} from '@gitroom/nestjs-libraries/stock/stock.provider';

// https://www.pexels.com/api/documentation/ (new keys are currently paused by
// Pexels, so this only works for installations that already have one)
export class PexelsProvider implements StockProvider {
  private readonly _logger = new Logger(PexelsProvider.name);
  readonly label = 'Pexels';
  readonly hosts = ['images.pexels.com', 'videos.pexels.com'];

  isConfigured() {
    return !!process.env.PEXELS_API_KEY;
  }

  async search(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockPhoto[]> {
    const key = process.env.PEXELS_API_KEY;
    if (!key) {
      return [];
    }
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?${new URLSearchParams({
          query,
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
      return (data.photos || [])
        .filter((p) => p?.src?.large2x && p?.src?.medium)
        .map((p) => ({
          id: `pexels-${p.id}`,
          provider: 'pexels',
          tags: String(p.alt || ''),
          preview: p.src.tiny || p.src.medium,
          thumb: p.src.medium,
          url: p.src.large2x,
          width: p.width,
          height: p.height,
          credit: {
            name: String(p.photographer || 'Pexels'),
            link: String(p.photographer_url || p.url || 'https://www.pexels.com'),
          },
        }));
    } catch (err) {
      this._logger.warn(`Pexels search error: ${err}`);
      return [];
    }
  }

  // https://www.pexels.com/api/documentation/#videos-search
  async searchVideos(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockVideo[]> {
    const key = process.env.PEXELS_API_KEY;
    if (!key) {
      return [];
    }
    try {
      const res = await fetch(
        `https://api.pexels.com/videos/search?${new URLSearchParams({
          query,
          orientation,
          per_page: String(perPage),
        })}`,
        {
          headers: { Authorization: key },
          signal: AbortSignal.timeout(10_000),
        }
      );
      if (!res.ok) {
        this._logger.warn(`Pexels video search failed with ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { videos?: any[] };
      const videos: StockVideo[] = [];
      for (const v of data.videos || []) {
        // the smallest mp4 that is still at least 720 on its short side
        const file = (v.video_files || [])
          .filter(
            (f: any) =>
              f?.link &&
              f.file_type === 'video/mp4' &&
              Math.min(f.width, f.height) >= 720
          )
          .sort(
            (a: any, b: any) => a.width * a.height - b.width * b.height
          )[0];
        if (!file || (Number(v.duration) || 0) < 3) {
          continue;
        }
        videos.push({
          id: `pexels-video-${v.id}`,
          provider: 'pexels',
          thumb: v.image || '',
          url: file.link,
          width: file.width,
          height: file.height,
          duration: Number(v.duration) || 0,
          credit: {
            name: String(v.user?.name || 'Pexels'),
            link: String(v.user?.url || v.url || 'https://www.pexels.com'),
          },
        });
      }
      return byOrientation(videos, orientation);
    } catch (err) {
      this._logger.warn(`Pexels video search error: ${err}`);
      return [];
    }
  }
}
