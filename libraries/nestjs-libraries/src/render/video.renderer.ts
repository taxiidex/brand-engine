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

// one scene of a story video: a clip or a still, with pictures laid over it
// (from..to seconds into the scene, at x,y)
export interface StoryScene {
  clip?: Buffer;
  still?: Buffer;
  layers: { png: Buffer; from: number; to?: number; x: number; y: number }[];
  seconds: number;
  pan?: 'left' | 'right' | 'up' | 'down';
}

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

  // A short video in scenes: each scene is a clip (or a still picture) with
  // pictures laid over it from given moments (words appearing one by one),
  // scenes joined by a transition. Writes an H.264/AAC MP4 with a silent
  // sound track and returns it with its length in seconds.
  renderStory(input: {
    width: number;
    height: number;
    scenes: StoryScene[];
    transition: string;
    transitionSeconds: number;
  }): Promise<{ buffer: Buffer; seconds: number }> {
    for (const scene of input.scenes) {
      if (scene.clip && !isMp4(scene.clip)) {
        return Promise.reject(new Error('A clip is not an MP4 video'));
      }
      if (!scene.clip && !scene.still) {
        return Promise.reject(new Error('A scene has no picture'));
      }
    }
    if (!/^[a-z]+$/.test(input.transition)) {
      return Promise.reject(new Error('Unknown transition'));
    }
    return oneAtATime(async () => {
      const dir = await mkdtemp(join(tmpdir(), 'brand-story-'));
      try {
        const { width: W, height: H } = input;
        const T = Math.max(0.2, Math.min(1, input.transitionSeconds));
        const args = ['-hide_banner', '-loglevel', 'error', '-y'];
        let next = 0;

        // the scenes' clips or stills first
        const sceneInput: number[] = [];
        for (let i = 0; i < input.scenes.length; i++) {
          const scene = input.scenes[i];
          if (scene.clip) {
            const file = join(dir, `clip-${i}.mp4`);
            await writeFile(file, scene.clip);
            // a short clip is looped to fill its scene
            args.push('-stream_loop', '-1', '-protocol_whitelist', 'file', '-i', file);
          } else {
            const file = join(dir, `still-${i}.png`);
            await writeFile(file, scene.still!);
            args.push('-loop', '1', '-framerate', '30', '-t', (scene.seconds + 0.2).toFixed(2), '-i', file);
          }
          sceneInput.push(next++);
        }
        // then every picture laid over them
        const layerInput: number[][] = [];
        for (let i = 0; i < input.scenes.length; i++) {
          layerInput.push([]);
          for (let k = 0; k < input.scenes[i].layers.length; k++) {
            const file = join(dir, `layer-${i}-${k}.png`);
            await writeFile(file, input.scenes[i].layers[k].png);
            args.push('-i', file);
            layerInput[i].push(next++);
          }
        }
        args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100');
        const audio = next++;

        const even = (v: number) => Math.ceil(v / 2) * 2;
        const filters: string[] = [];
        input.scenes.forEach((scene, i) => {
          const D = scene.seconds.toFixed(3);
          if (scene.clip) {
            // slightly larger than the frame, then a slow pan across it
            const sw = even(W * 1.1);
            const sh = even(H * 1.1);
            const pan = scene.pan || 'right';
            const sign = pan === 'left' || pan === 'up' ? -1 : 1;
            const horizontal = pan === 'left' || pan === 'right';
            const x = horizontal
              ? `(iw-ow)/2+min((iw-ow)/2,${Math.round(W * 0.06)})*(2*t/${D}-1)*${sign}`
              : '(iw-ow)/2';
            const y = horizontal
              ? '(ih-oh)/2'
              : `(ih-oh)/2+min((ih-oh)/2,${Math.round(H * 0.05)})*(2*t/${D}-1)*${sign}`;
            filters.push(
              `[${sceneInput[i]}:v]trim=duration=${D},setpts=PTS-STARTPTS,` +
                `scale=${sw}:${sh}:force_original_aspect_ratio=increase,` +
                `crop=${W}:${H}:x='${x}':y='${y}',fps=30,` +
                `eq=brightness=-0.02:saturation=1.08,setsar=1[c${i}]`
            );
          } else {
            filters.push(
              `[${sceneInput[i]}:v]trim=duration=${D},setpts=PTS-STARTPTS,scale=${W}:${H},fps=30,setsar=1[c${i}]`
            );
          }
          let last = `c${i}`;
          scene.layers.forEach((layer, k) => {
            const from = layer.from.toFixed(3);
            const to = (layer.to ?? scene.seconds + 1).toFixed(3);
            const out = `c${i}l${k}`;
            filters.push(
              `[${last}][${layerInput[i][k]}:v]overlay=${Math.round(layer.x)}:${Math.round(layer.y)}:enable='between(t,${from},${to})'[${out}]`
            );
            last = out;
          });
          filters.push(`[${last}]format=yuv420p,settb=AVTB,fps=30[s${i}]`);
        });

        // join the scenes, each transition overlapping the two scenes
        let joined = 's0';
        let length = input.scenes[0].seconds;
        for (let i = 1; i < input.scenes.length; i++) {
          const offset = length - T;
          filters.push(
            `[${joined}][s${i}]xfade=transition=${input.transition}:duration=${T}:offset=${offset.toFixed(3)}[x${i}]`
          );
          joined = `x${i}`;
          length = offset + input.scenes[i].seconds;
        }
        filters.push(`[${joined}]format=yuv420p[v]`);

        const out = join(dir, 'out.mp4');
        args.push(
          '-filter_complex',
          filters.join(';'),
          '-map',
          '[v]',
          '-map',
          `${audio}:a`,
          '-t',
          length.toFixed(2),
          '-r',
          '30',
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
          out
        );

        await new Promise<void>((resolve, reject) =>
          execFile(
            'ffmpeg',
            args,
            { timeout: 300_000, maxBuffer: 1024 * 1024 },
            (err, _stdout, stderr) =>
              err
                ? reject(new Error(`ffmpeg failed: ${String(stderr || err.message).slice(0, 400)}`))
                : resolve()
          )
        );
        return { buffer: await readFile(out), seconds: Math.round(length * 10) / 10 };
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    });
  }
}
