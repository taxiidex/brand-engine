import { Injectable } from '@nestjs/common';
import {
  createCanvas,
  GlobalFonts,
  Image,
  loadImage,
  SKRSContext2D,
} from '@napi-rs/canvas';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// Designed post layouts. Every post gets a layout, a palette derived from the
// brand colours and a type pairing that follows the post's vibe, so posts
// look designed and different from each other while staying on brand.
// ---------------------------------------------------------------------------

export const VIBES = [
  'professional',
  'bold',
  'funny',
  'aesthetic',
  'inspiring',
] as const;
export type Vibe = (typeof VIBES)[number];

export const DESIGN_SIZES = {
  feed: { width: 1080, height: 1350 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1200, height: 628 },
  story: { width: 1080, height: 1920 },
} as const;
export type DesignSize = keyof typeof DESIGN_SIZES;

// What a layout can be filled with. Words in the headline wrapped in
// *asterisks* are emphasised (highlighted, coloured or italic).
export interface Slots {
  kicker?: string;
  headline: string;
  subtext?: string;
  items?: string[];
  bigNumber?: string;
  bigNumberLabel?: string;
  myth?: string;
  fact?: string;
  before?: string;
  after?: string;
  beforeLabel?: string;
  afterLabel?: string;
  question?: string;
  answer?: string;
  quote?: string;
  quoteAuthor?: string;
  memeTop?: string;
  memeBottom?: string;
}

export interface DesignBrand {
  businessName: string;
  primaryColor: string;
  accentColor: string;
  ctaText?: string | null;
  handle?: string | null;
}

export interface Palette {
  id: string;
  bg: string;
  bg2: string; // gradient end, same as bg for flat palettes
  surface: string; // cards on the background
  surfaceInk: string;
  ink: string; // text on bg
  inkSoft: string;
  accent: string; // visible on bg
  accentInk: string; // text on accent
}

export interface LayoutInfo {
  id: string;
  family: string;
  // slots the layout cannot work without
  needs: (keyof Slots)[];
  photo: boolean;
  vibes: Vibe[];
  // multi-image post
  carousel?: boolean;
}

export const LAYOUTS: LayoutInfo[] = [
  { id: 'statement', family: 'type', needs: ['headline'], photo: false, vibes: ['professional', 'bold', 'inspiring'] },
  { id: 'poster', family: 'type', needs: ['headline'], photo: false, vibes: ['bold', 'funny', 'inspiring'] },
  { id: 'minimal', family: 'type', needs: ['headline'], photo: false, vibes: ['aesthetic', 'professional', 'inspiring'] },
  { id: 'big-number', family: 'data', needs: ['bigNumber', 'bigNumberLabel'], photo: false, vibes: ['professional', 'bold', 'inspiring'] },
  { id: 'checklist', family: 'list', needs: ['items'], photo: false, vibes: ['professional', 'aesthetic', 'inspiring'] },
  { id: 'steps', family: 'list', needs: ['items'], photo: false, vibes: ['professional', 'bold'] },
  { id: 'notes', family: 'list', needs: ['items'], photo: false, vibes: ['aesthetic', 'funny'] },
  { id: 'myth-fact', family: 'split', needs: ['myth', 'fact'], photo: false, vibes: ['professional', 'bold', 'funny'] },
  { id: 'compare', family: 'split', needs: ['before', 'after'], photo: false, vibes: ['professional', 'bold', 'funny'] },
  { id: 'qa', family: 'chat', needs: ['question', 'answer'], photo: false, vibes: ['funny', 'professional', 'aesthetic'] },
  { id: 'tweet', family: 'chat', needs: ['headline'], photo: false, vibes: ['bold', 'funny', 'professional'] },
  { id: 'sticky', family: 'chat', needs: ['headline'], photo: false, vibes: ['funny', 'aesthetic'] },
  { id: 'quote', family: 'quote', needs: ['quote', 'quoteAuthor'], photo: false, vibes: ['professional', 'aesthetic', 'inspiring'] },
  { id: 'photo-full', family: 'photo', needs: ['headline'], photo: true, vibes: ['professional', 'bold', 'inspiring', 'aesthetic'] },
  { id: 'photo-split', family: 'photo', needs: ['headline'], photo: true, vibes: ['professional', 'aesthetic', 'inspiring'] },
  { id: 'photo-frame', family: 'photo', needs: ['headline'], photo: true, vibes: ['aesthetic', 'professional', 'funny'] },
  { id: 'meme', family: 'photo', needs: ['memeTop', 'memeBottom'], photo: true, vibes: ['funny'] },
  { id: 'carousel', family: 'carousel', needs: ['headline', 'items'], photo: false, vibes: ['professional', 'bold', 'aesthetic', 'inspiring', 'funny'], carousel: true },
];

// ---- fonts ------------------------------------------------------------------

let fontsLoaded = false;
const loadFonts = () => {
  if (fontsLoaded) {
    return;
  }
  fontsLoaded = true;
  const dirs = [
    process.env.BRAND_FONTS_DIR,
    '/usr/share/fonts/truetype/brand-engine',
    join(process.cwd(), 'libraries/nestjs-libraries/src/render/fonts'),
    join(__dirname, 'fonts'),
  ].filter((d): d is string => !!d);
  for (const dir of dirs) {
    try {
      if (!existsSync(dir)) {
        continue;
      }
      for (const file of readdirSync(dir)) {
        if (/\.(ttf|otf)$/i.test(file)) {
          GlobalFonts.registerFromPath(join(dir, file));
        }
      }
      return;
    } catch (err) {
      // try the next folder
    }
  }
};

// Display face, body face and how the display face is used, per vibe
interface TypeSet {
  display: string;
  displayWeight: string;
  upper: boolean;
  body: string;
  emphasis: 'marker' | 'color' | 'italic' | 'underline';
  tracking: number; // letter spacing of the display face, in em
}
const FALLBACK =
  '"Noto Sans", "Noto Sans Arabic", "Noto Sans Devanagari", "DejaVu Sans", sans-serif';
const TYPE: Record<Vibe, TypeSet[]> = {
  professional: [
    { display: 'Poppins', displayWeight: '800', upper: false, body: 'Inter', emphasis: 'color', tracking: -0.02 },
    { display: 'Archivo Black', displayWeight: '400', upper: false, body: 'Inter', emphasis: 'underline', tracking: -0.01 },
  ],
  bold: [
    { display: 'Anton', displayWeight: '400', upper: true, body: 'Inter', emphasis: 'marker', tracking: 0.01 },
    { display: 'Bebas Neue', displayWeight: '400', upper: true, body: 'Inter', emphasis: 'color', tracking: 0.02 },
  ],
  funny: [
    { display: 'Permanent Marker', displayWeight: '400', upper: false, body: 'Inter', emphasis: 'color', tracking: 0 },
    { display: 'Poppins', displayWeight: '900', upper: false, body: 'Inter', emphasis: 'marker', tracking: -0.02 },
  ],
  aesthetic: [
    { display: 'DM Serif Display', displayWeight: '400', upper: false, body: 'Inter', emphasis: 'italic', tracking: -0.01 },
    { display: 'Abril Fatface', displayWeight: '400', upper: false, body: 'Inter', emphasis: 'color', tracking: 0 },
  ],
  inspiring: [
    { display: 'Archivo Black', displayWeight: '400', upper: false, body: 'Inter', emphasis: 'marker', tracking: -0.01 },
    { display: 'Poppins', displayWeight: '800', upper: false, body: 'Inter', emphasis: 'underline', tracking: -0.02 },
  ],
};

// ---- colour -----------------------------------------------------------------

const hex = (v: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(v || '') ? v.toUpperCase() : fallback;
const rgbOf = (h: string) => {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c: number[]) =>
  '#' +
  c
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const x = rgbOf(a);
  const y = rgbOf(b);
  return toHex(x.map((v, i) => v + (y[i] - v) * t));
};
const lum = (h: string) => {
  const [r, g, b] = rgbOf(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrast = (a: string, b: string) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const INK_DARK = '#121212';
const INK_LIGHT = '#FFFFFF';
const inkFor = (bg: string) =>
  contrast(bg, INK_LIGHT) >= contrast(bg, INK_DARK) ? INK_LIGHT : INK_DARK;
// moves a colour towards black or white until it reaches the contrast wanted
const ensure = (color: string, bg: string, min: number) => {
  if (contrast(color, bg) >= min) {
    return color;
  }
  const target = lum(bg) > 0.4 ? '#000000' : '#FFFFFF';
  for (let t = 0.1; t <= 1.0001; t += 0.1) {
    const c = mix(color, target, t);
    if (contrast(c, bg) >= min) {
      return c;
    }
  }
  return target === '#000000' ? INK_DARK : INK_LIGHT;
};

// 8 palettes from the two brand colours; text colours are chosen so small
// text reaches 4.5:1 and accents 3:1 against what they sit on
export const palettesFor = (primary: string, accent: string): Palette[] => {
  const p = hex(primary, '#1F2937');
  const a = hex(accent, '#F59E0B');
  const make = (id: string, bg: string, bg2: string, accentRaw: string, surfaceRaw?: string): Palette => {
    // the text must read on both ends of a gradient
    const darkest = lum(bg) < lum(bg2) ? bg : bg2;
    const lightest = darkest === bg ? bg2 : bg;
    const inkL = Math.min(contrast(INK_LIGHT, darkest), contrast(INK_LIGHT, lightest));
    const inkD = Math.min(contrast(INK_DARK, darkest), contrast(INK_DARK, lightest));
    const ink = inkL >= inkD ? INK_LIGHT : INK_DARK;
    const acc = ensure(accentRaw, bg, 3);
    const surface = surfaceRaw || (ink === INK_LIGHT ? mix(bg, '#FFFFFF', 0.08) : '#FFFFFF');
    return {
      id,
      bg,
      bg2,
      surface,
      surfaceInk: inkFor(surface),
      ink,
      inkSoft: ink === INK_LIGHT ? 'rgba(255,255,255,0.78)' : 'rgba(18,18,18,0.72)',
      accent: acc,
      accentInk: inkFor(acc),
    };
  };
  const dark = mix(p, '#000000', 0.86);
  const light = mix(p, '#FFFFFF', 0.93);
  return [
    make('dark', dark, dark, contrast(a, dark) > contrast(p, dark) ? a : p),
    make('light', light, light, contrast(p, light) > contrast(a, light) ? p : a, '#FFFFFF'),
    make('brand', p, p, a),
    make('accent', a, a, p),
    make('gradient', p, mix(p, '#000000', 0.55), a),
    make('pale', mix(a, '#FFFFFF', 0.86), mix(a, '#FFFFFF', 0.86), p, '#FFFFFF'),
    make('cream', '#F6F1E7', '#F6F1E7', p, '#FFFFFF'),
    make('night', '#0B0B0F', mix(p, '#0B0B0F', 0.7), a),
  ].map((pal) => ({
    ...pal,
    // keep the gradient end readable for the chosen ink
    bg2: contrast(pal.ink, pal.bg2) >= 4.5 ? pal.bg2 : pal.bg,
  }));
};

// ---- small helpers ----------------------------------------------------------

type Ctx = SKRSContext2D;

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const isRaster = (b?: Buffer) =>
  !!b &&
  ((b.length > 8 && b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') ||
    (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (b.length > 12 &&
      b.toString('latin1', 0, 4) === 'RIFF' &&
      b.toString('latin1', 8, 12) === 'WEBP'));

const decode = async (b?: Buffer) => {
  if (!isRaster(b)) {
    return null;
  }
  try {
    return await loadImage(b!);
  } catch (err) {
    return null;
  }
};

const rounded = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

// ---- text layout ------------------------------------------------------------

interface Word {
  text: string;
  em: boolean;
}

// "Every *empty mile* costs" -> words with an emphasis flag
const parseWords = (text: string, upper: boolean): Word[] => {
  const out: Word[] = [];
  let inside = false;
  for (const raw of text.replace(/\s+/g, ' ').trim().split(' ')) {
    if (!raw) {
      continue;
    }
    let t = raw;
    let em = inside;
    if (t.startsWith('*')) {
      inside = true;
      em = true;
      t = t.slice(1);
    }
    if (t.endsWith('*') || t.endsWith('*,') || t.endsWith('*.') || t.endsWith('*!') || t.endsWith('*?')) {
      t = t.replace(/\*(?=[,.!?]?$)/, '');
      inside = false;
    }
    t = t.replace(/\*/g, '');
    if (t) {
      out.push({ text: upper ? t.toLocaleUpperCase() : t, em });
    }
  }
  return out;
};

interface FitOptions {
  font: (size: number, em?: boolean) => string;
  maxWidth: number;
  maxHeight: number;
  maxSize: number;
  minSize: number;
  lineHeight: number;
  tracking?: number; // em
  maxLines?: number;
}
interface Fitted {
  size: number;
  lines: Word[][];
  height: number;
}

const wordWidth = (ctx: Ctx, w: Word, o: FitOptions, size: number) => {
  ctx.font = o.font(size, w.em);
  return ctx.measureText(w.text).width + (o.tracking || 0) * size * w.text.length;
};

// Largest size at which the text fits without breaking a word; null when it
// does not fit even at the smallest size, so the caller can pick another
// layout instead of squeezing it
const fitWords = (ctx: Ctx, words: Word[], o: FitOptions): Fitted | null => {
  if (!words.length) {
    return { size: o.minSize, lines: [], height: 0 };
  }
  // text without spaces (Chinese, Japanese) may be broken anywhere
  const noSpaces = words.length === 1 && /[　-鿿가-힯]/.test(words[0].text);
  for (let size = Math.round(o.maxSize); size >= o.minSize; size -= 2) {
    ctx.font = o.font(size);
    const space = ctx.measureText(' ').width;
    const lines: Word[][] = [];
    let line: Word[] = [];
    let width = 0;
    let tooWide = false;
    for (const w of words) {
      const ww = wordWidth(ctx, w, o, size);
      if (ww > o.maxWidth && !noSpaces) {
        tooWide = true;
        break;
      }
      const next = line.length ? width + space + ww : ww;
      if (next <= o.maxWidth || !line.length) {
        line.push(w);
        width = next;
      } else {
        lines.push(line);
        line = [w];
        width = ww;
      }
    }
    if (tooWide) {
      continue;
    }
    if (line.length) {
      lines.push(line);
    }
    // no lonely short word on the last line
    if (lines.length > 1) {
      const last = lines[lines.length - 1];
      const prev = lines[lines.length - 2];
      if (last.length === 1 && last[0].text.length <= 4 && prev.length > 2) {
        last.unshift(prev.pop()!);
      }
    }
    const height = lines.length * size * o.lineHeight;
    if (height <= o.maxHeight && (!o.maxLines || lines.length <= o.maxLines)) {
      return { size, lines, height };
    }
  }
  return null;
};

interface DrawText {
  x: number;
  y: number;
  width: number;
  align: 'left' | 'center';
  color: string;
  emColor: string; // emphasis colour (marker background or text colour)
  emInk: string; // text on the marker
  emphasis: TypeSet['emphasis'];
  o: FitOptions;
}

// draws fitted lines from the top (y) and returns the bottom
const drawWords = (ctx: Ctx, f: Fitted, d: DrawText) => {
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  let y = d.y;
  for (const line of f.lines) {
    ctx.font = d.o.font(f.size);
    const space = ctx.measureText(' ').width;
    const widths = line.map((w) => wordWidth(ctx, w, d.o, f.size));
    const total = widths.reduce((a, b) => a + b, 0) + space * (line.length - 1);
    let x = d.align === 'center' ? d.x + (d.width - total) / 2 : d.x;
    const baseline = y + f.size * 0.92;
    line.forEach((w, i) => {
      ctx.font = d.o.font(f.size, w.em && d.emphasis === 'italic');
      ctx.letterSpacing = `${(d.o.tracking || 0) * f.size}px`;
      if (w.em && d.emphasis === 'marker') {
        ctx.fillStyle = d.emColor;
        const pad = f.size * 0.08;
        rounded(ctx, x - pad, y + f.size * 0.06, widths[i] + pad * 2, f.size * 0.98, f.size * 0.08);
        ctx.fill();
        ctx.fillStyle = d.emInk;
      } else if (w.em && (d.emphasis === 'color' || d.emphasis === 'italic')) {
        ctx.fillStyle = d.emColor;
      } else {
        ctx.fillStyle = d.color;
      }
      ctx.fillText(w.text, x, baseline);
      if (w.em && d.emphasis === 'underline') {
        ctx.fillStyle = d.emColor;
        ctx.fillRect(x, baseline + f.size * 0.08, widths[i], Math.max(4, f.size * 0.07));
      }
      ctx.letterSpacing = '0px';
      // the space after an emphasised word is part of the marker run
      x += widths[i] + space;
    });
    y += f.size * d.o.lineHeight;
  }
  return y;
};

// ---- the renderer -------------------------------------------------------------

export interface DesignInput {
  layout: string;
  size: DesignSize;
  vibe: Vibe;
  palette: Palette;
  slots: Slots;
  brand: DesignBrand;
  logo?: Buffer;
  photo?: Buffer;
  seed: number;
}

export interface DesignOutput {
  layout: string;
  palette: string;
  width: number;
  height: number;
  mime: 'image/png' | 'image/jpeg';
  // one image, or several for a carousel
  images: Buffer[];
}

interface Scene {
  ctx: Ctx;
  w: number;
  h: number;
  u: number; // scale unit: 1 at 1080 wide square
  m: number; // side margin
  top: number; // first usable y
  bottom: number; // last usable y (above the footer)
  pal: Palette;
  type: TypeSet;
  brand: DesignBrand;
  logo: Image | null;
  photo: Image | null;
  rand: () => number;
  story: boolean;
}

export class LayoutDoesNotFit extends Error {}

@Injectable()
export class DesignRenderer {
  constructor() {
    loadFonts();
  }

  palettes(primary: string, accent: string) {
    return palettesFor(primary, accent);
  }

  typeSetFor(vibe: Vibe, seed: number) {
    const sets = TYPE[vibe] || TYPE.professional;
    return sets[Math.abs(seed) % sets.length];
  }

  // Renders a layout; throws LayoutDoesNotFit when the text does not fit it
  async render(input: DesignInput): Promise<DesignOutput> {
    const info = LAYOUTS.find((l) => l.id === input.layout);
    if (!info) {
      throw new LayoutDoesNotFit(`Unknown layout ${input.layout}`);
    }
    const { width, height } = DESIGN_SIZES[input.size];
    const logo = await decode(input.logo);
    const photo = info.photo ? await decode(input.photo) : null;
    if (info.photo && !photo) {
      throw new LayoutDoesNotFit('This layout needs a photo');
    }
    const type = this.typeSetFor(input.vibe, input.seed);

    const scene = (ctx: Ctx): Scene => {
      const u = Math.sqrt(width * height) / 1080;
      const story = input.size === 'story';
      return {
        ctx,
        w: width,
        h: height,
        u,
        m: Math.round(width * 0.075),
        // stories keep text out of the top 250 and bottom 340 of 1920
        top: story ? Math.round(height * 0.13) : Math.round(height * 0.07),
        bottom: story ? Math.round(height * (1 - 0.177)) : Math.round(height * 0.93),
        pal: input.palette,
        type,
        brand: input.brand,
        logo,
        photo,
        rand: rng(input.seed),
        story,
      };
    };

    const images: Buffer[] = [];
    if (info.carousel) {
      const items = (input.slots.items || []).slice(0, 6);
      const total = items.length + 2;
      const pages: ((s: Scene) => void)[] = [
        (s) => this.carouselCover(s, input.slots, total),
        ...items.map((item, i) => (s: Scene) => this.carouselItem(s, item, i, total)),
        (s) => this.carouselEnd(s, input.slots, total),
      ];
      for (const page of pages) {
        const canvas = createCanvas(width, height);
        page(scene(canvas.getContext('2d')));
        images.push(canvas.toBuffer('image/png'));
      }
    } else {
      const canvas = createCanvas(width, height);
      const s = scene(canvas.getContext('2d'));
      const draw = (this as any)[`layout_${input.layout.replace(/-/g, '_')}`] as (
        s: Scene,
        slots: Slots
      ) => void;
      draw.call(this, s, input.slots);
      images.push(
        info.photo
          ? canvas.toBuffer('image/jpeg', 90)
          : canvas.toBuffer('image/png')
      );
    }

    return {
      layout: input.layout,
      palette: input.palette.id,
      width,
      height,
      mime: info.photo ? 'image/jpeg' : 'image/png',
      images,
    };
  }

  // ---- shared pieces --------------------------------------------------------

  private fontFor(s: Scene, display: boolean) {
    return (size: number, italic?: boolean) =>
      display
        ? `${italic && s.type.display === 'DM Serif Display' ? 'italic ' : ''}${s.type.displayWeight} ${size}px "${s.type.display}", ${FALLBACK}`
        : `500 ${size}px "${s.type.body}", Inter, ${FALLBACK}`;
  }

  private background(s: Scene, deco = true) {
    const { ctx, w, h, pal } = s;
    if (pal.bg2 !== pal.bg) {
      const g = ctx.createLinearGradient(0, 0, w * 0.6, h);
      g.addColorStop(0, pal.bg);
      g.addColorStop(1, pal.bg2);
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = pal.bg;
    }
    ctx.fillRect(0, 0, w, h);
    if (!deco) {
      return;
    }
    // one of a few quiet decorations, so cards do not all look alike
    const kind = Math.floor(s.rand() * 4);
    ctx.save();
    if (kind === 0) {
      ctx.globalAlpha = pal.ink === INK_LIGHT ? 0.08 : 0.07;
      ctx.fillStyle = pal.ink;
      const step = 36 * s.u;
      for (let y = step; y < h * 0.3; y += step) {
        for (let x = w * 0.62; x < w; x += step) {
          ctx.beginPath();
          ctx.arc(x, y, 3 * s.u, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else if (kind === 1) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(w * (0.85 + s.rand() * 0.1), h * (0.05 + s.rand() * 0.1), w * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else if (kind === 2) {
      ctx.globalAlpha = pal.ink === INK_LIGHT ? 0.06 : 0.05;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 2 * s.u;
      const step = 54 * s.u;
      for (let x = 0; x < w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
    } else {
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = pal.accent;
      ctx.fillRect(0, 0, w, 14 * s.u);
    }
    ctx.restore();
  }

  // logo badge and name on the left, call to action on the right; returns
  // the top of the footer
  private footer(s: Scene, opts: { onPhoto?: boolean; cta?: boolean } = {}) {
    const { ctx, w, u, m } = s;
    const height = 64 * u;
    const y = s.bottom - height + (s.story ? 0 : 10 * u);
    const ink = opts.onPhoto ? INK_LIGHT : s.pal.ink;
    let left = m;
    if (s.logo) {
      const box = height;
      ctx.fillStyle = '#FFFFFF';
      rounded(ctx, left, y, box, box, 14 * u);
      ctx.fill();
      const pad = 9 * u;
      const scale = Math.min((box - pad * 2) / s.logo.width, (box - pad * 2) / s.logo.height);
      const lw = s.logo.width * scale;
      const lh = s.logo.height * scale;
      ctx.drawImage(s.logo, left + (box - lw) / 2, y + (box - lh) / 2, lw, lh);
      left += box + 16 * u;
    }
    const cta = opts.cta !== false && s.brand.ctaText?.trim() ? s.brand.ctaText.trim() : '';
    ctx.font = `700 ${26 * u}px "Poppins", Inter, ${FALLBACK}`;
    const ctaW = cta ? Math.min(ctx.measureText(cta).width + 52 * u, w * 0.45) : 0;
    ctx.font = `700 ${28 * u}px Inter, ${FALLBACK}`;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const nameRoom = w - m - left - ctaW - 20 * u;
    let name = s.brand.businessName;
    while (name.length > 2 && ctx.measureText(name).width > nameRoom) {
      name = name.slice(0, -2);
    }
    if (name !== s.brand.businessName) {
      name = name.trimEnd() + '…';
    }
    ctx.fillText(name, left, y + height / 2);
    if (cta) {
      const pillH = 52 * u;
      const px = w - m - ctaW;
      const py = y + (height - pillH) / 2;
      const bg = opts.onPhoto ? s.pal.accent : s.pal.accent;
      ctx.fillStyle = bg;
      rounded(ctx, px, py, ctaW, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = inkFor(bg);
      ctx.font = `700 ${26 * u}px "Poppins", Inter, ${FALLBACK}`;
      ctx.textAlign = 'center';
      let label = cta;
      while (label.length > 2 && ctx.measureText(label).width > ctaW - 40 * u) {
        label = label.slice(0, -2);
      }
      ctx.fillText(label === cta ? cta : label + '…', px + ctaW / 2, py + pillH / 2 + 2 * u);
      ctx.textAlign = 'left';
    }
    ctx.textBaseline = 'alphabetic';
    return y;
  }

  private kicker(s: Scene, text: string | undefined, x: number, y: number, color?: string, onPhoto = false) {
    if (!text?.trim()) {
      return y;
    }
    const { ctx, u } = s;
    const label = text.trim().toLocaleUpperCase().slice(0, 40);
    ctx.font = `700 ${22 * u}px "Poppins", Inter, ${FALLBACK}`;
    ctx.letterSpacing = `${2.5 * u}px`;
    const tw = ctx.measureText(label).width + 2.5 * u * label.length;
    const bg = color || s.pal.accent;
    ctx.fillStyle = onPhoto ? bg : bg;
    rounded(ctx, x, y, tw + 36 * u, 46 * u, 23 * u);
    ctx.fill();
    ctx.fillStyle = inkFor(bg);
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 18 * u, y + 24 * u);
    ctx.letterSpacing = '0px';
    ctx.textBaseline = 'alphabetic';
    return y + 46 * u;
  }

  private headline(
    s: Scene,
    text: string,
    box: { x: number; y: number; w: number; h: number },
    opts: {
      align?: 'left' | 'center';
      maxSize?: number;
      minSize?: number;
      color?: string;
      emColor?: string;
      emInk?: string;
      lineHeight?: number;
      maxLines?: number;
      vertical?: 'top' | 'center' | 'bottom';
    } = {}
  ) {
    const o: FitOptions = {
      font: this.fontFor(s, true),
      maxWidth: box.w,
      maxHeight: box.h,
      maxSize: opts.maxSize || 120 * s.u,
      minSize: opts.minSize || 40 * s.u,
      lineHeight: opts.lineHeight || (s.type.upper ? 1.02 : 1.1),
      tracking: s.type.tracking,
      maxLines: opts.maxLines,
    };
    const fitted = fitWords(s.ctx, parseWords(text, s.type.upper), o);
    if (!fitted) {
      throw new LayoutDoesNotFit('headline');
    }
    const y =
      opts.vertical === 'center'
        ? box.y + (box.h - fitted.height) / 2
        : opts.vertical === 'bottom'
        ? box.y + box.h - fitted.height
        : box.y;
    const emColor = opts.emColor || s.pal.accent;
    const bottom = drawWords(s.ctx, fitted, {
      x: box.x,
      y,
      width: box.w,
      align: opts.align || 'left',
      color: opts.color || s.pal.ink,
      emColor,
      emInk: opts.emInk || inkFor(emColor),
      emphasis:
        s.type.emphasis === 'color' && contrast(emColor, s.pal.bg) < 3
          ? 'underline'
          : s.type.emphasis,
      o,
    });
    return { top: y, bottom, size: fitted.size };
  }

  private body(
    s: Scene,
    text: string | undefined,
    box: { x: number; y: number; w: number; h: number },
    opts: { size?: number; color?: string; align?: 'left' | 'center'; weight?: number } = {}
  ) {
    if (!text?.trim()) {
      return box.y;
    }
    const weight = opts.weight || 500;
    const o: FitOptions = {
      font: (size) => `${weight} ${size}px Inter, ${FALLBACK}`,
      maxWidth: box.w,
      maxHeight: box.h,
      maxSize: opts.size || 38 * s.u,
      minSize: 24 * s.u,
      lineHeight: 1.35,
    };
    const fitted = fitWords(s.ctx, parseWords(text.replace(/\*/g, ''), false), o);
    if (!fitted) {
      throw new LayoutDoesNotFit('body');
    }
    return drawWords(s.ctx, fitted, {
      x: box.x,
      y: box.y,
      width: box.w,
      align: opts.align || 'left',
      color: opts.color || s.pal.inkSoft,
      emColor: s.pal.accent,
      emInk: s.pal.accentInk,
      emphasis: 'color',
      o,
    });
  }

  private check(s: Scene, x: number, y: number, r: number, good: boolean, bg?: string) {
    const { ctx } = s;
    ctx.fillStyle = bg || (good ? s.pal.accent : '#E5484D');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = inkFor(ctx.fillStyle as string);
    ctx.lineWidth = r * 0.22;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (good) {
      ctx.moveTo(x - r * 0.42, y + r * 0.02);
      ctx.lineTo(x - r * 0.1, y + r * 0.34);
      ctx.lineTo(x + r * 0.45, y - r * 0.32);
    } else {
      ctx.moveTo(x - r * 0.35, y - r * 0.35);
      ctx.lineTo(x + r * 0.35, y + r * 0.35);
      ctx.moveTo(x + r * 0.35, y - r * 0.35);
      ctx.lineTo(x - r * 0.35, y + r * 0.35);
    }
    ctx.stroke();
  }

  private cover(ctx: Ctx, img: Image, x: number, y: number, w: number, h: number) {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  // average brightness (0 to 1) of an area of what is already drawn
  private brightness(s: Scene, x: number, y: number, w: number, h: number) {
    const data = s.ctx.getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))).data;
    let total = 0;
    let count = 0;
    let bright = 0;
    for (let i = 0; i < data.length; i += 4 * 37) {
      const l = (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      total += l;
      count++;
      if (l > 0.7) {
        bright++;
      }
    }
    return { mean: count ? total / count : 0, brightShare: count ? bright / count : 0 };
  }

  // ---- layouts ----------------------------------------------------------------

  private layout_statement(s: Scene, slots: Slots) {
    this.background(s);
    const footerTop = this.footer(s);
    let y = this.kicker(s, slots.kicker, s.m, s.top);
    y += 40 * s.u;
    const subH = slots.subtext ? 170 * s.u : 0;
    const head = this.headline(
      s,
      slots.headline,
      { x: s.m, y, w: s.w - 2 * s.m, h: footerTop - y - subH - 60 * s.u },
      { maxSize: 150 * s.u, vertical: 'center' }
    );
    this.body(s, slots.subtext, { x: s.m, y: head.bottom + 30 * s.u, w: s.w - 2 * s.m, h: subH });
  }

  // condensed uppercase lines, each sized to fill the width
  private layout_poster(s: Scene, slots: Slots) {
    this.background(s, false);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    const words = parseWords(slots.headline, true);
    if (words.length > 14) {
      throw new LayoutDoesNotFit('too many words for a poster');
    }
    // 2 to 5 lines with roughly even character counts
    const totalChars = words.reduce((a, w2) => a + w2.text.length, 0);
    const lineCount = Math.min(5, Math.max(2, Math.round(totalChars / 9)));
    const target = totalChars / lineCount;
    const lines: Word[][] = [];
    let current: Word[] = [];
    let chars = 0;
    for (const word of words) {
      if (current.length && chars + word.text.length > target * 1.15 && lines.length < lineCount - 1) {
        lines.push(current);
        current = [];
        chars = 0;
      }
      current.push(word);
      chars += word.text.length + 1;
    }
    lines.push(current);
    const face = s.type.upper ? s.type.display : 'Anton';
    const font = (size: number) => `400 ${size}px "${face}", ${FALLBACK}`;
    const sizes = lines.map((line) => {
      ctx.font = font(100);
      const text = line.map((x) => x.text).join(' ');
      return Math.min(((w - 2 * m) / ctx.measureText(text).width) * 100, 260 * u);
    });
    const subH = slots.subtext ? 120 * u : 0;
    const room = footerTop - s.top - subH - 60 * u;
    const gap = 0.96;
    const totalH = sizes.reduce((a, b) => a + b * gap, 0);
    const scale = totalH > room ? room / totalH : 1;
    let y = s.top + Math.max(0, (room - totalH * scale) / 2);
    lines.forEach((line, i) => {
      const size = sizes[i] * scale;
      const text = line.map((x) => x.text).join(' ');
      const em = line.some((x) => x.em) || (i === lines.length - 1 && !words.some((x) => x.em));
      ctx.font = font(size);
      ctx.fillStyle = em ? pal.accent : pal.ink;
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, m, y + size * 0.86);
      y += size * gap;
    });
    this.body(s, slots.subtext, { x: m, y: y + 30 * u, w: w - 2 * m, h: subH });
  }

  private layout_minimal(s: Scene, slots: Slots) {
    this.background(s, false);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s, { cta: false });
    ctx.fillStyle = pal.inkSoft;
    ctx.font = `600 ${22 * u}px "Poppins", Inter, ${FALLBACK}`;
    ctx.textAlign = 'center';
    ctx.letterSpacing = `${4 * u}px`;
    const label = (slots.kicker || s.brand.businessName).toLocaleUpperCase().slice(0, 36);
    ctx.fillText(label, w / 2, s.top + 30 * u);
    ctx.letterSpacing = '0px';
    ctx.textAlign = 'left';
    ctx.fillStyle = pal.accent;
    ctx.fillRect(w / 2 - 40 * u, s.top + 60 * u, 80 * u, 3 * u);
    const subH = slots.subtext ? 150 * u : 0;
    const box = { x: m * 1.4, y: s.top + 120 * u, w: w - m * 2.8, h: footerTop - s.top - 220 * u - subH };
    const head = this.headline(s, slots.headline, box, { align: 'center', maxSize: 110 * u, vertical: 'center', lineHeight: 1.14 });
    this.body(s, slots.subtext, { x: m * 1.4, y: head.bottom + 34 * u, w: w - m * 2.8, h: subH }, { align: 'center', size: 34 * u });
  }

  private layout_big_number(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    let y = this.kicker(s, slots.kicker, m, s.top) + 30 * u;
    const number = (slots.bigNumber || '').trim().slice(0, 8);
    const font = (size: number) => `400 ${size}px "Anton", ${FALLBACK}`;
    let size = Math.min(420 * u, (footerTop - y) * 0.45);
    ctx.font = font(size);
    while (ctx.measureText(number).width > w - 2 * m && size > 80 * u) {
      size -= 8 * u;
      ctx.font = font(size);
    }
    ctx.fillStyle = pal.accent;
    ctx.fillText(number, m - 6 * u, y + size * 0.9);
    y += size * 0.98;
    const label = this.headline(s, slots.bigNumberLabel || '', { x: m, y, w: w - 2 * m, h: 160 * u }, { maxSize: 64 * u, minSize: 30 * u });
    this.body(s, slots.headline.replace(/\*/g, ''), { x: m, y: label.bottom + 30 * u, w: w - 2 * m, h: footerTop - label.bottom - 70 * u }, { size: 38 * u });
  }

  private layout_checklist(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    const items = (slots.items || []).slice(0, 5);
    if (items.length < 2) {
      throw new LayoutDoesNotFit('needs at least 2 items');
    }
    let y = this.kicker(s, slots.kicker, m, s.top) + 30 * u;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: (footerTop - y) * 0.36 }, { maxSize: 92 * u });
    y = head.bottom + 36 * u;
    const panelH = footerTop - y - 40 * u;
    ctx.fillStyle = pal.surface;
    rounded(ctx, m, y, w - 2 * m, panelH, 28 * u);
    ctx.fill();
    const rowH = panelH / items.length;
    items.forEach((item, i) => {
      const cy = y + rowH * i + rowH / 2;
      this.check(s, m + 52 * u, cy, 24 * u, true, pal.accent === pal.surface ? pal.ink : undefined);
      const o: FitOptions = {
        font: (size) => `600 ${size}px Inter, ${FALLBACK}`,
        maxWidth: w - 2 * m - 130 * u,
        maxHeight: rowH - 20 * u,
        maxSize: 40 * u,
        minSize: 22 * u,
        lineHeight: 1.25,
      };
      const f = fitWords(ctx, parseWords(item, false), o);
      if (!f) {
        throw new LayoutDoesNotFit('list item');
      }
      drawWords(ctx, f, { x: m + 100 * u, y: cy - f.height / 2, width: o.maxWidth, align: 'left', color: pal.surfaceInk, emColor: pal.accent, emInk: pal.accentInk, emphasis: 'color', o });
      if (i < items.length - 1) {
        ctx.fillStyle = pal.surfaceInk === INK_LIGHT ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(m + 30 * u, y + rowH * (i + 1), w - 2 * m - 60 * u, 2 * u);
      }
    });
  }

  private layout_steps(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    const items = (slots.items || []).slice(0, 4);
    if (items.length < 2) {
      throw new LayoutDoesNotFit('needs at least 2 steps');
    }
    let y = this.kicker(s, slots.kicker, m, s.top) + 30 * u;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: (footerTop - y) * 0.32 }, { maxSize: 88 * u });
    y = head.bottom + 50 * u;
    const rowH = (footerTop - y - 40 * u) / items.length;
    const cx = m + 40 * u;
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 4 * u;
    ctx.beginPath();
    ctx.moveTo(cx, y + rowH / 2);
    ctx.lineTo(cx, y + rowH * (items.length - 0.5));
    ctx.stroke();
    items.forEach((item, i) => {
      const cy = y + rowH * i + rowH / 2;
      ctx.fillStyle = pal.accent;
      ctx.beginPath();
      ctx.arc(cx, cy, 38 * u, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = pal.accentInk;
      ctx.font = `400 ${40 * u}px "Anton", ${FALLBACK}`;
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), cx, cy + 15 * u);
      ctx.textAlign = 'left';
      const o: FitOptions = {
        font: (size) => `600 ${size}px Inter, ${FALLBACK}`,
        maxWidth: w - 2 * m - 120 * u,
        maxHeight: rowH - 16 * u,
        maxSize: 40 * u,
        minSize: 22 * u,
        lineHeight: 1.25,
      };
      const f = fitWords(ctx, parseWords(item, false), o);
      if (!f) {
        throw new LayoutDoesNotFit('step');
      }
      drawWords(ctx, f, { x: m + 110 * u, y: cy - f.height / 2, width: o.maxWidth, align: 'left', color: pal.ink, emColor: pal.accent, emInk: pal.accentInk, emphasis: 'color', o });
    });
  }

  // an iPhone-notes style card
  private layout_notes(s: Scene, slots: Slots) {
    const { ctx, w, h, u, m, pal } = s;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    const footerTop = this.footer(s);
    const items = (slots.items || []).slice(0, 6);
    if (items.length < 2) {
      throw new LayoutDoesNotFit('needs items');
    }
    const x = m;
    const y = s.top;
    const cw = w - 2 * m;
    const ch = footerTop - y - 40 * u;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 16 * u;
    ctx.fillStyle = '#FFFDF5';
    rounded(ctx, x, y, cw, ch, 30 * u);
    ctx.fill();
    ctx.restore();
    // header bar
    ctx.fillStyle = '#F5C542';
    ctx.font = `600 ${26 * u}px Inter, ${FALLBACK}`;
    ctx.fillText('‹ Notes', x + 34 * u, y + 58 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.textAlign = 'right';
    ctx.font = `500 ${22 * u}px Inter, ${FALLBACK}`;
    ctx.fillText('Done', x + cw - 34 * u, y + 58 * u);
    ctx.textAlign = 'left';
    const inner = { x: x + 40 * u, w: cw - 80 * u };
    const titleO: FitOptions = {
      font: (size) => `800 ${size}px Inter, ${FALLBACK}`,
      maxWidth: inner.w,
      maxHeight: ch * 0.3,
      maxSize: 64 * u,
      minSize: 32 * u,
      lineHeight: 1.15,
    };
    const tf = fitWords(ctx, parseWords(slots.headline.replace(/\*/g, ''), false), titleO);
    if (!tf) {
      throw new LayoutDoesNotFit('title');
    }
    let ty = drawWords(ctx, tf, { x: inner.x, y: y + 100 * u, width: inner.w, align: 'left', color: '#1C1C1E', emColor: '#1C1C1E', emInk: '#FFFFFF', emphasis: 'color', o: titleO });
    ty += 24 * u;
    const rowH = (y + ch - 40 * u - ty) / items.length;
    items.forEach((item, i) => {
      const iy = ty + rowH * i;
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 2 * u;
      ctx.beginPath();
      ctx.moveTo(inner.x, iy + rowH);
      ctx.lineTo(inner.x + inner.w, iy + rowH);
      ctx.stroke();
      ctx.strokeStyle = '#F5C542';
      ctx.lineWidth = 3 * u;
      ctx.beginPath();
      ctx.arc(inner.x + 18 * u, iy + rowH / 2, 16 * u, 0, Math.PI * 2);
      ctx.stroke();
      const o: FitOptions = {
        font: (size) => `500 ${size}px Inter, ${FALLBACK}`,
        maxWidth: inner.w - 60 * u,
        maxHeight: rowH - 10 * u,
        maxSize: 36 * u,
        minSize: 22 * u,
        lineHeight: 1.25,
      };
      const f = fitWords(ctx, parseWords(item, false), o);
      if (!f) {
        throw new LayoutDoesNotFit('note');
      }
      drawWords(ctx, f, { x: inner.x + 52 * u, y: iy + (rowH - f.height) / 2, width: o.maxWidth, align: 'left', color: '#1C1C1E', emColor: '#1C1C1E', emInk: '#FFFFFF', emphasis: 'color', o });
    });
    void pal;
  }

  private layout_myth_fact(s: Scene, slots: Slots) {
    this.background(s, false);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    let y = s.top;
    if (slots.kicker) {
      y = this.kicker(s, slots.kicker, m, y) + 30 * u;
    }
    const half = (footerTop - y - 70 * u) / 2;
    const panels: [string, string, boolean][] = [
      ['MYTH', slots.myth || '', false],
      ['FACT', slots.fact || '', true],
    ];
    panels.forEach(([label, text, good], i) => {
      const py = y + i * (half + 30 * u);
      const bg = good ? pal.accent : pal.surface;
      const ink = inkFor(bg);
      ctx.fillStyle = bg;
      rounded(ctx, m, py, w - 2 * m, half, 30 * u);
      ctx.fill();
      this.check(s, m + 70 * u, py + 74 * u, 34 * u, good, good ? ink : '#E5484D');
      if (good) {
        // redraw the tick in the panel colour on the ink disc
        this.check(s, m + 70 * u, py + 74 * u, 34 * u, true, ink === INK_LIGHT ? '#FFFFFF' : '#121212');
      }
      ctx.fillStyle = ink;
      ctx.font = `400 ${54 * u}px "Anton", ${FALLBACK}`;
      ctx.letterSpacing = `${3 * u}px`;
      ctx.fillText(label, m + 124 * u, py + 94 * u);
      ctx.letterSpacing = '0px';
      const o: FitOptions = {
        font: (size) => (good ? `700 ${size}px "Poppins", Inter, ${FALLBACK}` : `600 ${size}px Inter, ${FALLBACK}`),
        maxWidth: w - 2 * m - 100 * u,
        maxHeight: half - 170 * u,
        maxSize: 56 * u,
        minSize: 26 * u,
        lineHeight: 1.22,
      };
      const f = fitWords(ctx, parseWords(text.replace(/\*/g, ''), false), o);
      if (!f) {
        throw new LayoutDoesNotFit('myth/fact text');
      }
      const ty = py + 140 * u;
      drawWords(ctx, f, { x: m + 50 * u, y: ty, width: o.maxWidth, align: 'left', color: ink, emColor: ink, emInk: bg, emphasis: 'color', o });
      if (!good) {
        // a strike through the myth
        ctx.strokeStyle = '#E5484D';
        ctx.lineWidth = 5 * u;
        f.lines.forEach((line, li) => {
          ctx.font = o.font(f.size);
          const lw = ctx.measureText(line.map((x) => x.text).join(' ')).width;
          const ly = ty + li * f.size * o.lineHeight + f.size * 0.6;
          ctx.beginPath();
          ctx.moveTo(m + 50 * u, ly);
          ctx.lineTo(m + 50 * u + lw, ly);
          ctx.stroke();
        });
      }
    });
  }

  private layout_compare(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    let y = this.kicker(s, slots.kicker, m, s.top) + 30 * u;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: (footerTop - y) * 0.3 }, { maxSize: 84 * u });
    y = head.bottom + 40 * u;
    const landscape = s.w > s.h;
    const gap = 24 * u;
    const cols: [string, string, boolean][] = [
      [slots.beforeLabel || 'The old way', slots.before || '', false],
      [slots.afterLabel || 'The better way', slots.after || '', true],
    ];
    const vertical = !landscape && s.h / s.w > 1.4;
    const cw = vertical ? w - 2 * m : (w - 2 * m - gap) / 2;
    const chh = vertical ? (footerTop - y - 40 * u - gap) / 2 : footerTop - y - 40 * u;
    cols.forEach(([label, text, good], i) => {
      const cx = vertical ? m : m + i * (cw + gap);
      const cy = vertical ? y + i * (chh + gap) : y;
      const bg = good ? pal.accent : pal.surface;
      const ink = inkFor(bg);
      ctx.fillStyle = bg;
      rounded(ctx, cx, cy, cw, chh, 26 * u);
      ctx.fill();
      this.check(s, cx + 52 * u, cy + 56 * u, 26 * u, good, good ? (ink === INK_LIGHT ? '#FFFFFF' : '#121212') : '#E5484D');
      const lo: FitOptions = {
        font: (size) => `800 ${size}px "Poppins", Inter, ${FALLBACK}`,
        maxWidth: cw - 120 * u,
        maxHeight: 76 * u,
        maxSize: 30 * u,
        minSize: 18 * u,
        lineHeight: 1.15,
        maxLines: 2,
      };
      const lf = fitWords(ctx, parseWords(label.toLocaleUpperCase(), false), lo);
      if (!lf) {
        throw new LayoutDoesNotFit('compare label');
      }
      drawWords(ctx, lf, { x: cx + 92 * u, y: cy + 56 * u - lf.height / 2, width: lo.maxWidth, align: 'left', color: ink, emColor: ink, emInk: bg, emphasis: 'color', o: lo });
      const o: FitOptions = {
        font: (size) => `600 ${size}px Inter, ${FALLBACK}`,
        maxWidth: cw - 64 * u,
        maxHeight: chh - 140 * u,
        maxSize: 42 * u,
        minSize: 22 * u,
        lineHeight: 1.28,
      };
      const f = fitWords(ctx, parseWords(text.replace(/\*/g, ''), false), o);
      if (!f) {
        throw new LayoutDoesNotFit('compare text');
      }
      drawWords(ctx, f, { x: cx + 32 * u, y: cy + 110 * u, width: o.maxWidth, align: 'left', color: ink, emColor: ink, emInk: bg, emphasis: 'color', o });
    });
  }

  // a DM-style conversation, large and centred in the free space
  private layout_qa(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    const top = this.kicker(s, slots.kicker || 'Asked & answered', m, s.top) + 50 * u;
    const room = footerTop - top - 60 * u;
    const gap = 54 * u;
    const fit = (text: string, right: boolean, maxH: number) => {
      const o: FitOptions = {
        font: (size) => `${right ? 600 : 500} ${size}px Inter, ${FALLBACK}`,
        maxWidth: (w - 2 * m) * 0.84 - 72 * u,
        maxHeight: maxH,
        maxSize: right ? 64 * u : 68 * u,
        minSize: 26 * u,
        lineHeight: 1.28,
      };
      const f = fitWords(ctx, parseWords(text.replace(/\*/g, ''), false), o);
      if (!f) {
        throw new LayoutDoesNotFit('bubble');
      }
      ctx.font = o.font(f.size);
      const tw = Math.max(...f.lines.map((line) => ctx.measureText(line.map((x) => x.text).join(' ')).width));
      return { f, o, tw, bw: tw + 72 * u, bh: f.height + 60 * u };
    };
    const q = fit(slots.question || slots.headline, false, room * 0.4);
    const a = fit(slots.answer || slots.subtext || '', true, room - q.bh - gap - 60 * u);
    let y = top + Math.max(0, (room - (q.bh + gap + a.bh)) / 2);
    const draw = (b: ReturnType<typeof fit>, right: boolean, bg: string) => {
      const ink = inkFor(bg);
      const bx = right ? w - m - b.bw : m;
      ctx.fillStyle = bg;
      rounded(ctx, bx, y, b.bw, b.bh, 38 * u);
      ctx.fill();
      // tail
      ctx.beginPath();
      if (right) {
        ctx.moveTo(bx + b.bw - 32 * u, y + b.bh - 2 * u);
        ctx.lineTo(bx + b.bw + 8 * u, y + b.bh + 16 * u);
        ctx.lineTo(bx + b.bw - 6 * u, y + b.bh - 26 * u);
      } else {
        ctx.moveTo(bx + 32 * u, y + b.bh - 2 * u);
        ctx.lineTo(bx - 8 * u, y + b.bh + 16 * u);
        ctx.lineTo(bx + 6 * u, y + b.bh - 26 * u);
      }
      ctx.fill();
      drawWords(ctx, b.f, { x: bx + 36 * u, y: y + 30 * u, width: b.tw, align: 'left', color: ink, emColor: ink, emInk: bg, emphasis: 'color', o: b.o });
      y += b.bh + gap;
    };
    draw(q, false, pal.surface);
    draw(a, true, pal.accent);
  }

  // looks like a post on X: logo avatar, name, handle and big text
  private layout_tweet(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s, { cta: true });
    const darkCard = pal.ink === INK_LIGHT && s.rand() > 0.4;
    const card = darkCard ? '#15181C' : '#FFFFFF';
    const ink = darkCard ? '#E7E9EA' : '#0F1419';
    const soft = darkCard ? '#71767B' : '#536471';
    const cx = m;
    const cw = w - 2 * m;
    const o: FitOptions = {
      font: (size) => `500 ${size}px Inter, ${FALLBACK}`,
      maxWidth: cw - 96 * u,
      maxHeight: (footerTop - s.top) * 0.62,
      maxSize: 68 * u,
      minSize: 32 * u,
      lineHeight: 1.3,
    };
    const f = fitWords(ctx, parseWords(slots.headline.replace(/\*/g, ''), false), o);
    if (!f) {
      throw new LayoutDoesNotFit('tweet text');
    }
    const ch = f.height + 260 * u;
    const cy = s.top + Math.max(0, (footerTop - s.top - 40 * u - ch) / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 50 * u;
    ctx.shadowOffsetY = 18 * u;
    ctx.fillStyle = card;
    rounded(ctx, cx, cy, cw, ch, 36 * u);
    ctx.fill();
    ctx.restore();
    const av = 84 * u;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx + 48 * u + av / 2, cy + 48 * u + av / 2, av / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(cx + 48 * u, cy + 48 * u, av, av);
    if (s.logo) {
      const sc = Math.min((av * 0.8) / s.logo.width, (av * 0.8) / s.logo.height);
      ctx.drawImage(s.logo, cx + 48 * u + (av - s.logo.width * sc) / 2, cy + 48 * u + (av - s.logo.height * sc) / 2, s.logo.width * sc, s.logo.height * sc);
    } else {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(cx + 48 * u, cy + 48 * u, av, av);
    }
    ctx.restore();
    ctx.fillStyle = ink;
    ctx.font = `700 ${34 * u}px Inter, ${FALLBACK}`;
    ctx.fillText(s.brand.businessName.slice(0, 28), cx + 156 * u, cy + 84 * u);
    ctx.fillStyle = soft;
    ctx.font = `400 ${28 * u}px Inter, ${FALLBACK}`;
    const handle = s.brand.handle || '@' + s.brand.businessName.replace(/[^A-Za-z0-9_]/g, '').toLowerCase().slice(0, 15);
    ctx.fillText(handle, cx + 156 * u, cy + 122 * u);
    drawWords(ctx, f, { x: cx + 48 * u, y: cy + 172 * u, width: o.maxWidth, align: 'left', color: ink, emColor: ink, emInk: card, emphasis: 'color', o });
  }

  // a sticky note on the brand colour, written with a marker
  private layout_sticky(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m } = s;
    const footerTop = this.footer(s);
    const size = Math.min(w - 2 * m - 60 * u, footerTop - s.top - 80 * u);
    const x = (w - size) / 2;
    const y = s.top + (footerTop - s.top - 40 * u - size) / 2;
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.rotate((s.rand() - 0.5) * 0.08);
    ctx.shadowColor = 'rgba(0,0,0,0.28)';
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 20 * u;
    ctx.fillStyle = '#FFE066';
    ctx.fillRect(-size / 2, -size / 2, size, size);
    ctx.shadowColor = 'transparent';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillRect(-size * 0.16, -size / 2 - 18 * u, size * 0.32, 44 * u);
    const o: FitOptions = {
      font: (sz) => `400 ${sz}px "Permanent Marker", ${FALLBACK}`,
      maxWidth: size - 120 * u,
      maxHeight: size - 160 * u,
      maxSize: 92 * u,
      minSize: 36 * u,
      lineHeight: 1.2,
    };
    const f = fitWords(ctx, parseWords(slots.headline, false), o);
    if (!f) {
      ctx.restore();
      throw new LayoutDoesNotFit('sticky');
    }
    drawWords(ctx, f, { x: -size / 2 + 60 * u, y: -f.height / 2, width: size - 120 * u, align: 'center', color: '#1F1F1F', emColor: '#D6336C', emInk: '#FFFFFF', emphasis: 'color', o });
    ctx.restore();
  }

  private layout_quote(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, u, m, pal } = s;
    const footerTop = this.footer(s);
    ctx.fillStyle = pal.accent;
    ctx.font = `400 ${300 * u}px "DM Serif Display", ${FALLBACK}`;
    ctx.fillText('“', m - 10 * u, s.top + 230 * u);
    const o: FitOptions = {
      font: (size, italic) => `${italic ? 'italic ' : ''}400 ${size}px "DM Serif Display", ${FALLBACK}`,
      maxWidth: w - 2 * m,
      maxHeight: footerTop - s.top - 420 * u,
      maxSize: 76 * u,
      minSize: 32 * u,
      lineHeight: 1.22,
    };
    const f = fitWords(ctx, parseWords(slots.quote || '', false), o);
    if (!f) {
      throw new LayoutDoesNotFit('quote');
    }
    const y = drawWords(ctx, f, { x: m, y: s.top + 250 * u, width: w - 2 * m, align: 'left', color: pal.ink, emColor: pal.accent, emInk: pal.accentInk, emphasis: 'italic', o });
    ctx.fillStyle = pal.accent;
    ctx.fillRect(m, y + 36 * u, 60 * u, 4 * u);
    ctx.fillStyle = pal.inkSoft;
    ctx.font = `600 ${30 * u}px Inter, ${FALLBACK}`;
    ctx.fillText((slots.quoteAuthor || '').slice(0, 60), m, y + 96 * u);
  }

  private photoShade(s: Scene, region: { y: number; h: number }, fromTop: boolean) {
    const { ctx, w } = s;
    // stronger shade over bright photos so white text stays readable
    const b = this.brightness(s, 0, region.y, w, region.h);
    const strength = Math.min(0.92, Math.max(0.5, 0.45 + b.mean * 0.55 + b.brightShare * 0.3));
    const g = fromTop
      ? ctx.createLinearGradient(0, region.y + region.h, 0, region.y)
      : ctx.createLinearGradient(0, region.y, 0, region.y + region.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, `rgba(0,0,0,${strength * 0.75})`);
    g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, region.y, w, region.h);
  }

  private layout_photo_full(s: Scene, slots: Slots) {
    const { ctx, w, h, u, m } = s;
    this.cover(ctx, s.photo!, 0, 0, w, h);
    // headline where the photo is calmer: top or bottom half
    const topB = this.brightness(s, 0, 0, w, h * 0.45);
    const botB = this.brightness(s, 0, h * 0.55, w, h * 0.45);
    const atTop = topB.mean + 0.05 < botB.mean ? false : topB.brightShare < botB.brightShare && s.rand() > 0.5;
    const region = atTop ? { y: 0, h: h * 0.62 } : { y: h * 0.38, h: h * 0.62 };
    this.photoShade(s, region, atTop);
    if (atTop) {
      // a light shade at the bottom for the footer
      this.photoShade(s, { y: h * 0.78, h: h * 0.22 }, false);
    }
    const footerTop = this.footer(s, { onPhoto: true });
    const subH = slots.subtext ? 130 * u : 0;
    if (atTop) {
      let y = this.kicker(s, slots.kicker, m, s.top, undefined, true) + 26 * u;
      const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: h * 0.38 }, { color: INK_LIGHT, maxSize: 112 * u });
      this.body(s, slots.subtext, { x: m, y: head.bottom + 22 * u, w: w - 2 * m, h: subH }, { color: 'rgba(255,255,255,0.9)' });
    } else {
      const head = this.headline(s, slots.headline, { x: m, y: footerTop - 50 * u - subH - h * 0.34, w: w - 2 * m, h: h * 0.34 }, { color: INK_LIGHT, maxSize: 112 * u, vertical: 'bottom' });
      this.kicker(s, slots.kicker, m, head.top - 74 * u, undefined, true);
      this.body(s, slots.subtext, { x: m, y: head.bottom + 22 * u, w: w - 2 * m, h: subH }, { color: 'rgba(255,255,255,0.9)' });
    }
  }

  private layout_photo_split(s: Scene, slots: Slots) {
    const { ctx, w, h, u, m, pal } = s;
    const landscape = w > h;
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);
    if (landscape) {
      this.cover(ctx, s.photo!, w * 0.5, 0, w * 0.5, h);
      const sub: Scene = { ...s, w: w * 0.5 };
      const footerTop = this.footer(sub);
      let y = this.kicker(sub, slots.kicker, m, s.top) + 20 * u;
      const head = this.headline(sub, slots.headline, { x: m, y, w: w * 0.5 - 2 * m, h: footerTop - y - 40 * u }, { maxSize: 72 * u, vertical: 'center' });
      void head;
      return;
    }
    const photoH = h * 0.52;
    this.cover(ctx, s.photo!, 0, 0, w, photoH);
    ctx.fillStyle = pal.accent;
    ctx.fillRect(0, photoH - 8 * u, w, 8 * u);
    const footerTop = this.footer(s);
    let y = photoH + 40 * u;
    y = this.kicker(s, slots.kicker, m, y) + 22 * u;
    const subH = slots.subtext ? 110 * u : 0;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: footerTop - y - subH - 40 * u }, { maxSize: 90 * u });
    this.body(s, slots.subtext, { x: m, y: head.bottom + 18 * u, w: w - 2 * m, h: subH });
  }

  private layout_photo_frame(s: Scene, slots: Slots) {
    this.background(s);
    const { ctx, w, h, u, m, pal } = s;
    const footerTop = this.footer(s);
    let y = this.kicker(s, slots.kicker, m, s.top) + 26 * u;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: (footerTop - y) * 0.34 }, { maxSize: 86 * u });
    const fy = head.bottom + 40 * u;
    const fh = footerTop - fy - 50 * u;
    if (fh < h * 0.25) {
      throw new LayoutDoesNotFit('no room for the photo');
    }
    ctx.save();
    ctx.translate(w / 2, fy + fh / 2);
    ctx.rotate((s.rand() - 0.5) * 0.05);
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 40 * u;
    ctx.shadowOffsetY = 16 * u;
    ctx.fillStyle = '#FFFFFF';
    const fw = w - 2 * m;
    rounded(ctx, -fw / 2, -fh / 2, fw, fh, 24 * u);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    rounded(ctx, -fw / 2 + 14 * u, -fh / 2 + 14 * u, fw - 28 * u, fh - 28 * u, 16 * u);
    ctx.clip();
    this.cover(ctx, s.photo!, -fw / 2 + 14 * u, -fh / 2 + 14 * u, fw - 28 * u, fh - 28 * u);
    ctx.restore();
    ctx.restore();
    void pal;
  }

  // classic meme: photo with white outlined text at the top and bottom
  private layout_meme(s: Scene, slots: Slots) {
    const { ctx, w, h, u, m } = s;
    this.cover(ctx, s.photo!, 0, 0, w, h);
    const draw = (text: string, top: boolean) => {
      const o: FitOptions = {
        font: (size) => `400 ${size}px "Anton", ${FALLBACK}`,
        maxWidth: w - 2 * m,
        maxHeight: h * 0.24,
        maxSize: 110 * u,
        minSize: 44 * u,
        lineHeight: 1.04,
        tracking: 0.01,
      };
      const f = fitWords(ctx, parseWords(text.replace(/\*/g, ''), true), o);
      if (!f) {
        throw new LayoutDoesNotFit('meme text');
      }
      let y = top ? s.top - 20 * u : s.bottom - 110 * u - f.height;
      ctx.lineJoin = 'round';
      for (const line of f.lines) {
        const t = line.map((x) => x.text).join(' ');
        ctx.font = o.font(f.size);
        const tw = ctx.measureText(t).width;
        const x = (w - tw) / 2;
        const base = y + f.size * 0.92;
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = f.size * 0.14;
        ctx.strokeText(t, x, base);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(t, x, base);
        y += f.size * o.lineHeight;
      }
    };
    draw(slots.memeTop || '', true);
    draw(slots.memeBottom || '', false);
    // small brand mark, no button: memes are for sharing
    this.footer(s, { onPhoto: true, cta: false });
  }

  // ---- carousel ---------------------------------------------------------------

  private pageDots(s: Scene, index: number, total: number) {
    const { ctx, w, u } = s;
    const y = s.story ? s.top - 40 * u : 46 * u;
    const gap = 22 * u;
    const start = w / 2 - ((total - 1) * gap) / 2;
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i === index ? s.pal.accent : s.pal.ink === INK_LIGHT ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(start + i * gap, y, i === index ? 7 * u : 5 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private swipe(s: Scene, y: number) {
    const { ctx, u, m, pal } = s;
    ctx.fillStyle = pal.accent;
    ctx.font = `700 ${28 * u}px "Poppins", Inter, ${FALLBACK}`;
    ctx.fillText('Swipe  →', m, y);
  }

  private carouselCover(s: Scene, slots: Slots, total: number) {
    this.background(s);
    this.pageDots(s, 0, total);
    const { u, m, w } = s;
    const footerTop = this.footer(s, { cta: false });
    let y = this.kicker(s, slots.kicker, m, s.top + 20 * u) + 40 * u;
    const head = this.headline(s, slots.headline, { x: m, y, w: w - 2 * m, h: footerTop - y - 170 * u }, { maxSize: 150 * u, vertical: 'center' });
    this.swipe(s, head.bottom + 90 * u);
  }

  private carouselItem(s: Scene, item: string, index: number, total: number) {
    this.background(s, false);
    this.pageDots(s, index + 1, total);
    const { ctx, u, m, w, pal } = s;
    const footerTop = this.footer(s, { cta: false });
    ctx.fillStyle = pal.accent;
    ctx.font = `400 ${200 * u}px "Anton", ${FALLBACK}`;
    ctx.fillText(String(index + 1).padStart(2, '0'), m - 6 * u, s.top + 210 * u);
    // "Title: detail" becomes a bold title and a lighter line
    const [title, ...rest] = item.split(/:\s+/);
    const detail = rest.join(': ');
    const head = this.headline(s, title, { x: m, y: s.top + 270 * u, w: w - 2 * m, h: detail ? (footerTop - s.top - 300 * u) * 0.5 : footerTop - s.top - 330 * u }, { maxSize: 96 * u });
    if (detail) {
      this.body(s, detail.charAt(0).toLocaleUpperCase() + detail.slice(1), { x: m, y: head.bottom + 34 * u, w: w - 2 * m, h: footerTop - head.bottom - 70 * u }, { size: 50 * u });
    }
  }

  private carouselEnd(s: Scene, slots: Slots, total: number) {
    this.background(s);
    this.pageDots(s, total - 1, total);
    const { ctx, u, m, w, h, pal } = s;
    if (s.logo) {
      const box = 180 * u;
      ctx.fillStyle = '#FFFFFF';
      rounded(ctx, (w - box) / 2, h * 0.24, box, box, 36 * u);
      ctx.fill();
      const sc = Math.min((box * 0.72) / s.logo.width, (box * 0.72) / s.logo.height);
      ctx.drawImage(s.logo, (w - s.logo.width * sc) / 2, h * 0.24 + (box - s.logo.height * sc) / 2, s.logo.width * sc, s.logo.height * sc);
    }
    const head = this.headline(s, slots.subtext || `Follow ${s.brand.businessName} for more`, { x: m, y: h * 0.24 + 240 * u, w: w - 2 * m, h: h * 0.3 }, { maxSize: 80 * u, align: 'center' });
    const cta = s.brand.ctaText?.trim();
    if (cta) {
      ctx.font = `700 ${34 * u}px "Poppins", Inter, ${FALLBACK}`;
      const bw = ctx.measureText(cta).width + 90 * u;
      const by = head.bottom + 60 * u;
      ctx.fillStyle = pal.accent;
      rounded(ctx, (w - bw) / 2, by, bw, 84 * u, 42 * u);
      ctx.fill();
      ctx.fillStyle = pal.accentInk;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(cta, w / 2, by + 44 * u);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
    }
  }
}
