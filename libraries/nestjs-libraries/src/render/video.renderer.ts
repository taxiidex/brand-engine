import { Injectable } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

export const VIDEO_SIZES = {
  story: { width: 1080, height: 1920 }, // Reels, Stories, TikTok, Shorts
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1280, height: 720 },
} as const;
export type VideoSize = keyof typeof VIDEO_SIZES;

// Only real MP4 files reach FFmpeg: no playlists or other formats that could
// make it read other files
const isMp4 = (buffer: Buffer) =>
  buffer.length > 12 && buffer.toString('latin1', 4, 8) === 'ftyp';

// One render at a time: FFmpeg is the heaviest thing on this server and it
// shares the machine with the rest of the product
let queue: Promise<unknown> = Promise.resolve();
const oneAtATime = <T>(job: () => Promise<T>): Promise<T> => {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
};

@Injectable()
export class VideoRenderer {
  // Crops the clip to the size, lays the branded overlay (a transparent PNG
  // of the same size) on top and writes an H.264/AAC MP4 that the social
  // networks accept, with a silent sound track.
  render(input: {
    clip: Buffer;
    overlay: Buffer;
    width: number;
    height: number;
    seconds: number;
  }): Promise<Buffer> {
    if (!isMp4(input.clip)) {
      return Promise.reject(new Error('The clip is not an MP4 video'));
    }
    return oneAtATime(async () => {
      const dir = await mkdtemp(join(tmpdir(), 'brand-video-'));
      try {
        const clip = join(dir, 'clip.mp4');
        const overlay = join(dir, 'overlay.png');
        const out = join(dir, 'out.mp4');
        await writeFile(clip, input.clip);
        await writeFile(overlay, input.overlay);

        const { width, height } = input;
        const args = [
          '-hide_banner',
          '-loglevel',
          'error',
          '-y',
          // a short clip is looped to fill the length
          '-stream_loop',
          '-1',
          '-protocol_whitelist',
          'file',
          '-i',
          clip,
          '-i',
          overlay,
          '-f',
          'lavfi',
          '-i',
          'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex',
          `[0:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},fps=30,eq=brightness=-0.04:saturation=1.05,setsar=1[bg];[bg][1:v]overlay=0:0:format=auto,format=yuv420p[v]`,
          '-map',
          '[v]',
          '-map',
          '2:a',
          '-t',
          String(input.seconds),
          '-c:v',
          'libx264',
          '-preset',
          'superfast',
          '-crf',
          '23',
          '-profile:v',
          'high',
          '-pix_fmt',
          'yuv420p',
          '-threads',
          '4',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          '+faststart',
          out,
        ];

        await new Promise<void>((resolve, reject) =>
          execFile(
            'ffmpeg',
            args,
            { timeout: 180_000, maxBuffer: 1024 * 1024 },
            (err, _stdout, stderr) =>
              err
                ? reject(
                    new Error(
                      `ffmpeg failed: ${String(stderr || err.message).slice(
                        0,
                        300
                      )}`
                    )
                  )
                : resolve()
          )
        );
        return await readFile(out);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}
