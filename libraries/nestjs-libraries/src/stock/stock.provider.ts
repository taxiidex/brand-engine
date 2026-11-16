export type StockOrientation = 'portrait' | 'landscape' | 'square';

export interface StockPhoto {
  id: string;
  provider: string;
  thumb: string;
  url: string;
  width: number;
  height: number;
  credit: { name: string; link: string };
}

// One free photo source. A provider only knows its own API; caching, merging
// and downloading live in StockService.
export interface StockProvider {
  // shown to the user next to the photographer credit
  readonly label: string;
  // hosts the provider's image urls live on, the only ones ever downloaded
  readonly hosts: string[];
  isConfigured(): boolean;
  search(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockPhoto[]>;
}
