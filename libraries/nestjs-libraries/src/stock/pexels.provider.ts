import { Logger } from '@nestjs/common';
import {
  StockOrientation,
  StockPhoto,
  StockProvider,
} from '@gitroom/nestjs-libraries/stock/stock.provider';

// https://www.pexels.com/api/documentation/ (new keys are currently paused by
// Pexels, so this only works for installations that already have one)
export class PexelsProvider implements StockProvider {
  private readonly _logger = new Logger(PexelsProvider.name);
  readonly label = 'Pexels';
  readonly hosts = ['images.pexels.com'];

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
}
