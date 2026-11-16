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

export interface StockVideo {
  id: string;
  provider: string;
  // a still frame for the picker
  thumb: string;
  // an mp4 file
  url: string;
  width: number;
  height: number;
  duration: number;
  credit: { name: string; link: string };
}

// One free media source. A provider only knows its own API; caching, merging
// and downloading live in StockService.
export interface StockProvider {
  // shown to the user next to the credit
  readonly label: string;
  // hosts the provider's media urls live on, the only ones ever downloaded
  readonly hosts: string[];
  isConfigured(): boolean;
  search(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockPhoto[]>;
  searchVideos(
    query: string,
    orientation: StockOrientation,
    perPage: number
  ): Promise<StockVideo[]>;
}

// Videos closest to the wanted shape first, so a vertical Reel is not cut
// out of the middle of a wide clip when a vertical clip exists
export const byOrientation = (
  videos: StockVideo[],
  orientation: StockOrientation
) => {
  const target =
    orientation === 'portrait' ? 9 / 16 : orientation === 'square' ? 1 : 16 / 9;
  return [...videos].sort(
    (a, b) =>
      Math.abs(Math.log(a.width / a.height / target)) -
      Math.abs(Math.log(b.width / b.height / target))
  );
};
