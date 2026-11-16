import { Logger } from '@nestjs/common';
import {
  StockOrientation,
  StockPhoto,
  StockProvider,
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
}
