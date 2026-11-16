import { Logger } from '@nestjs/common';
import {
  byOrientation,
  StockOrientation,
  StockPhoto,
  StockProvider,
  StockVideo,
} from '@gitroom/nestjs-libraries/stock/stock.provider';

// https://pixabay.com/api/docs/ . Free key, no approval. Pixabay's terms ask
// for results to be cached for 24 hours and for images not to be hotlinked,
// which is what StockService does (it downloads the picked photo and renders
// it into a new image).
export class PixabayProvider implements StockProvider {
  private readonly _logger = new Logger(PixabayProvider.name);
  readonly label = 'Pixabay';
  // previews come from cdn.pixabay.com and the larger sizes from pixabay.com
  readonly hosts = ['pixabay.com'];

  isConfigured() {
    return !!process.env.PIXABAY_API_KEY;
  }

  async search(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockPhoto[]> {
    const key = process.env.PIXABAY_API_KEY;
    if (!key) {
      return [];
    }
    try {
      const res = await fetch(
        `https://pixabay.com/api/?${new URLSearchParams({
          key,
          q: query.slice(0, 100),
          image_type: 'photo',
          orientation:
            orientation === 'portrait'
              ? 'vertical'
              : orientation === 'landscape'
              ? 'horizontal'
              : 'all',
          per_page: String(Math.max(3, perPage)),
          safesearch: 'true',
        })}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        this._logger.warn(`Pixabay search failed with ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { hits?: any[] };
      return (data.hits || [])
        .filter((p) => p?.largeImageURL && p?.webformatURL)
        .map((p) => ({
          id: `pixabay-${p.id}`,
          provider: 'pixabay',
          thumb: p.webformatURL,
          url: p.largeImageURL,
          width: p.imageWidth,
          height: p.imageHeight,
          credit: {
            name: String(p.user || 'Pixabay'),
            link: p.user_id
              ? `https://pixabay.com/users/${encodeURIComponent(
                  p.user
                )}-${p.user_id}/`
              : String(p.pageURL || 'https://pixabay.com'),
          },
        }));
    } catch (err) {
      this._logger.warn(`Pixabay search error: ${err}`);
      return [];
    }
  }

  // https://pixabay.com/api/docs/#api_search_videos
  async searchVideos(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockVideo[]> {
    const key = process.env.PIXABAY_API_KEY;
    if (!key) {
      return [];
    }
    try {
      const res = await fetch(
        `https://pixabay.com/api/videos/?${new URLSearchParams({
          key,
          q: query.slice(0, 100),
          video_type: 'film',
          // more than needed: the closest shapes are picked below
          per_page: String(Math.min(50, Math.max(3, perPage * 3))),
          safesearch: 'true',
        })}`,
        { signal: AbortSignal.timeout(10_000) }
      );
      if (!res.ok) {
        this._logger.warn(`Pixabay video search failed with ${res.status}`);
        return [];
      }
      const data = (await res.json()) as { hits?: any[] };
      const videos: StockVideo[] = [];
      for (const v of data.hits || []) {
        // large is 1080p or more; medium (720p) keeps the download small
        const file =
          v?.videos?.large?.url && v.videos.large.size < 40_000_000
            ? v.videos.large
            : v?.videos?.medium;
        if (!file?.url || !file.width || !file.height) {
          continue;
        }
        if ((Number(v.duration) || 0) < 3) {
          continue;
        }
        videos.push({
          id: `pixabay-video-${v.id}`,
          provider: 'pixabay',
          thumb: file.thumbnail || v.videos?.tiny?.thumbnail || '',
          url: file.url,
          width: file.width,
          height: file.height,
          duration: Number(v.duration) || 0,
          credit: {
            name: String(v.user || 'Pixabay'),
            link: v.user_id
              ? `https://pixabay.com/users/${encodeURIComponent(v.user)}-${
                  v.user_id
                }/`
              : String(v.pageURL || 'https://pixabay.com'),
          },
        });
      }
      return byOrientation(videos, orientation).slice(0, perPage);
    } catch (err) {
      this._logger.warn(`Pixabay video search error: ${err}`);
      return [];
    }
  }
}
