import { Injectable } from '@nestjs/common';
import { createCanvas, loadImage, Image, SKRSContext2D } from '@napi-rs/canvas';

export const IMAGE_TEMPLATES = ['photo-hook', 'quote-card', 'brand-card'] as const;
export type ImageTemplate = (typeof IMAGE_TEMPLATES)[number];

export const IMAGE_SIZES = {
  feed: { width: 1080, height: 1350 }, // 4:5, Instagram / Facebook feed
  square: { width: 1080, height: 1080 },
  landscape: { width: 1200, height: 628 }, // LinkedIn / X link-style
  story: { width: 1080, height: 1920 }, // Stories, Reels cover, TikTok
} as const;
export type ImageSize = keyof typeof IMAGE_SIZES;

export interface RenderBrand {
  businessName: string;
  primaryColor: string;
  accentColor: string;
  fontFamily: string;
  ctaText?: string | null;
}

export interface RenderInput {
  template: ImageTemplate;
  size: ImageSize;
  hook: string;
  subtext?: string;
  brand: RenderBrand;
  logo?: Buffer;
  photo?: Buffer;
}

export interface RenderOutput {
  // may differ from the requested one: a photo template without a usable
  // photo is rendered as a brand card
  template: ImageTemplate;
  buffer: Buffer;
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
}

type Ctx = SKRSContext2D;
type Fit = { size: number; lines: string[] };

const FALLBACK_COLOR = '#111111';

const validHex = (value: string, fallback: string) =>
  /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : fallback;

const rgb = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

const toHex = (c: number[]) =>
  '#' +
  c
    .map((v) => Math.round(v).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

// WCAG contrast ratio, 1 (identical) to 21 (black on white)
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const readableOn = (background: string) =>
  contrast(background, '#FFFFFF') >= contrast(background, '#111111')
    ? '#FFFFFF'
    : '#111111';

const mix = (hex: string, target: string, amount: number) => {
  const a = rgb(hex);
  const b = rgb(target);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};

// Only plain raster formats are decoded. SVG is refused on purpose: the
// renderer would resolve whatever files or URLs the SVG points at.
const isRaster = (buffer: Buffer) =>
  (buffer.length > 8 &&
    buffer[0] === 0x89 &&
    buffer.toString('latin1', 1, 4) === 'PNG') ||
  (buffer.length > 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff) ||
  (buffer.length > 12 &&
    buffer.toString('latin1', 0, 4) === 'RIFF' &&
    buffer.toString('latin1', 8, 12) === 'WEBP');

@Injectable()
export class ImageRenderer {
  async render(input: RenderInput): Promise<RenderOutput> {
    const { width, height } = IMAGE_SIZES[input.size];
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const primary = validHex(input.brand.primaryColor, FALLBACK_COLOR);
    const accent = validHex(input.brand.accentColor, '#FF5733');
    const family = `"${(input.brand.fontFamily || 'Inter').replace(
      /["\\]/g,
      ''
    )}", Inter, "DejaVu Sans", sans-serif`;

    const logo = await this.decode(input.logo);
    const photo =
      input.template === 'photo-hook' ? await this.decode(input.photo) : null;
    // a photo template without a usable photo is a brand card
    const template: ImageTemplate =
      input.template === 'photo-hook' && !photo ? 'brand-card' : input.template;

    const ctxInfo = {
      ctx,
      w: width,
      h: height,
      // one unit scales type and spacing so every size looks proportionate
      u: Math.sqrt(width * height) / 1080,
      family,
      primary,
      accent,
      brand: input.brand,
      logo,
      hook: input.hook,
      subtext: input.subtext?.trim() || '',
      story: input.size === 'story',
    };

    if (template === 'photo-hook') {
      this.photoHook(ctxInfo, photo!);
    } else if (template === 'quote-card') {
      this.quoteCard(ctxInfo);
    } else {
      this.brandCard(ctxInfo);
    }

    return template === 'photo-hook'
      ? {
          template,
          buffer: canvas.toBuffer('image/jpeg', 90),
          mime: 'image/jpeg',
          width,
          height,
        }
      : {
          template,
          buffer: canvas.toBuffer('image/png'),
          mime: 'image/png',
          width,
          height,
        };
  }

  private async decode(buffer?: Buffer): Promise<Image | null> {
    if (!buffer || !isRaster(buffer)) {
      return null;
    }
    try {
      return await loadImage(buffer);
    } catch (err) {
      return null;
    }
  }

  // ---- templates ---------------------------------------------------------

  private photoHook(s: Scene, photo: Image) {
    const { ctx, w, h, u } = s;
    const m = 80 * u;

    this.cover(ctx, photo, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    ctx.fillRect(0, 0, w, h);
    const shade = ctx.createLinearGradient(0, h * 0.3, 0, h);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.9)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, h * 0.3, w, h * 0.7);

    const footerTop = this.footer(s, m, '#000000', '#FFFFFF');
    this.textBlock(s, {
      left: m,
      width: w - 2 * m,
      bottom: footerTop - 40 * u,
      hookMax: 96 * u,
      hookHeight: h * 0.3,
      color: '#FFFFFF',
      accent: this.visible(s.accent, '#000000', '#FFFFFF'),
    });
  }

  private quoteCard(s: Scene) {
    const { ctx, w, h, u, primary, accent } = s;
    const m = 80 * u;
    const text = readableOn(primary);

    ctx.fillStyle = primary;
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, w);
    glow.addColorStop(0, 'rgba(255,255,255,0.14)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // the opening quote mark
    ctx.font = `bold ${300 * u}px ${s.family}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = this.visible(accent, primary, text);
    ctx.fillText('\u201C', m - 10 * u, m - 70 * u);

    const footerTop = this.footer(s, m, primary, text);
    this.textBlock(s, {
      left: m,
      width: w - 2 * m,
      top: m + 190 * u,
      bottom: footerTop - 40 * u,
      hookMax: 84 * u,
      hookHeight: h,
      color: text,
      accent: this.visible(accent, primary, text),
    });
  }

  private brandCard(s: Scene) {
    const { ctx, w, h, u, primary, accent } = s;
    const m = 80 * u;
    const end = mix(primary, '#000000', 0.5);
    const text = readableOn(mix(primary, '#000000', 0.25));

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, primary);
    bg.addColorStop(1, end);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.22;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(w * 0.92, h * 0.12, w * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.arc(w * 0.1, h * 0.95, w * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    const footerTop = this.footer(s, m, end, text);
    this.textBlock(s, {
      left: m,
      width: w - 2 * m,
      top: h * 0.2,
      bottom: footerTop - 40 * u,
      hookMax: 100 * u,
      hookHeight: h * 0.4,
      color: text,
      accent: this.visible(accent, primary, text),
    });
  }

  // ---- building blocks ---------------------------------------------------

  // Hook, accent bar and subtext, either anchored to `bottom` or starting at `top`
  private textBlock(
    s: Scene,
    o: {
      left: number;
      width: number;
      top?: number;
      bottom: number;
      hookMax: number;
      hookHeight: number;
      color: string;
      accent: string;
    }
  ) {
    const { ctx, u } = s;
    const bar = 10 * u;
    const gap = 28 * u;

    const sub = s.subtext
      ? this.fit(ctx, s.subtext, {
          family: s.family,
          weight: '400',
          maxWidth: o.width,
          maxHeight: 130 * u,
          maxSize: 40 * u,
          minSize: 24 * u,
          lineHeight: 1.3,
        })
      : null;
    const subHeight = sub ? sub.lines.length * sub.size * 1.3 : 0;

    const room =
      (o.top !== undefined ? o.bottom - o.top : o.hookHeight + 200 * u) -
      (sub ? subHeight + gap : 0) -
      gap -
      bar;
    const hook = this.fit(ctx, s.hook, {
      family: s.family,
      weight: 'bold',
      maxWidth: o.width,
      maxHeight: Math.max(Math.min(o.hookHeight, room), 60 * u),
      maxSize: o.hookMax,
      minSize: 34 * u,
      lineHeight: 1.12,
    });
    const hookHeight = hook.lines.length * hook.size * 1.12;
    const total = bar + gap + hookHeight + (sub ? gap + subHeight : 0);

    let y = o.top !== undefined ? o.top : o.bottom - total;

    ctx.fillStyle = o.accent;
    ctx.fillRect(o.left, y, 120 * u, bar);
    y += bar + gap;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = o.color;
    ctx.font = `bold ${hook.size}px ${s.family}`;
    for (const line of hook.lines) {
      ctx.fillText(line, o.left, y);
      y += hook.size * 1.12;
    }

    if (sub) {
      y += gap - 6 * u;
      ctx.globalAlpha = 0.88;
      ctx.font = `400 ${sub.size}px ${s.family}`;
      for (const line of sub.lines) {
        ctx.fillText(line, o.left, y);
        y += sub.size * 1.3;
      }
      ctx.globalAlpha = 1;
    }
  }

  // Logo (on a white badge, so any logo stays readable) or the business name
  // on the left, call to action on the right. Returns the top of the footer.
  private footer(s: Scene, margin: number, background: string, textColor: string) {
    const { ctx, w, h, u } = s;
    const height = 64 * u;
    // stories keep clear of the app's own buttons at the bottom
    const bottomPad = s.story ? 250 * u : margin * 0.8;
    const y = h - bottomPad - height;
    const hasCta = !!s.brand.ctaText?.trim();

    let ctaWidth = 0;
    if (hasCta) {
      ctx.font = `bold ${28 * u}px ${s.family}`;
      const label = this.ellipsize(ctx, s.brand.ctaText!.trim(), w * 0.4);
      ctaWidth = ctx.measureText(label).width + 56 * u;
      const pillHeight = height * 0.86;
      const pillX = w - margin - ctaWidth;
      const pillY = y + (height - pillHeight) / 2;
      const pillBg = this.visible(s.accent, background, textColor);
      ctx.fillStyle = pillBg;
      this.roundedRect(ctx, pillX, pillY, ctaWidth, pillHeight, pillHeight / 2);
      ctx.fill();
      ctx.fillStyle = readableOn(pillBg);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + ctaWidth / 2, pillY + pillHeight / 2 + 1 * u);
    }

    const room = w - 2 * margin - ctaWidth - (hasCta ? 24 * u : 0);
    if (s.logo) {
      const boxHeight = height - 16 * u;
      const aspect = s.logo.width / s.logo.height;
      const logoWidth = Math.min(boxHeight * aspect, 240 * u, room - 28 * u);
      const logoHeight = logoWidth / aspect;
      const badgeWidth = logoWidth + 28 * u;
      ctx.fillStyle = 'rgba(255,255,255,0.96)';
      this.roundedRect(ctx, margin, y, badgeWidth, height, 12 * u);
      ctx.fill();
      ctx.drawImage(
        s.logo,
        margin + 14 * u,
        y + (height - logoHeight) / 2,
        logoWidth,
        logoHeight
      );
    } else {
      ctx.font = `bold ${34 * u}px ${s.family}`;
      ctx.fillStyle = textColor;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        this.ellipsize(ctx, s.brand.businessName, room),
        margin,
        y + height / 2
      );
    }
    return y;
  }

  // The accent colour when it stands out from the background, otherwise the
  // plain text colour, so a bar or button never disappears
  private visible(accent: string, background: string, fallback: string) {
    return contrast(accent, background) >= 1.8 ? accent : fallback;
  }

  private cover(ctx: Ctx, image: Image, w: number, h: number) {
    const scale = Math.max(w / image.width, h / image.height);
    const sw = w / scale;
    const sh = h / scale;
    ctx.drawImage(
      image,
      (image.width - sw) / 2,
      (image.height - sh) / 2,
      sw,
      sh,
      0,
      0,
      w,
      h
    );
  }

  private roundedRect(
    ctx: Ctx,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  // ---- text fitting ------------------------------------------------------

  // Largest size that fits the box; at the smallest size an overflow is cut
  // with an ellipsis rather than spilling over the footer
  private fit(
    ctx: Ctx,
    text: string,
    o: {
      family: string;
      weight: string;
      maxWidth: number;
      maxHeight: number;
      maxSize: number;
      minSize: number;
      lineHeight: number;
    }
  ): Fit {
    const clean = text.replace(/\s+/g, ' ').trim();
    let size = Math.round(o.maxSize);
    for (;;) {
      ctx.font = `${o.weight} ${size}px ${o.family}`;
      const lines = this.wrap(ctx, clean, o.maxWidth);
      if (lines.length * size * o.lineHeight <= o.maxHeight || size <= o.minSize) {
        const maxLines = Math.max(
          1,
          Math.floor(o.maxHeight / (size * o.lineHeight))
        );
        if (lines.length > maxLines) {
          lines.length = maxLines;
          lines[maxLines - 1] = this.ellipsize(
            ctx,
            lines[maxLines - 1] + '\u2026',
            o.maxWidth
          );
        }
        return { size, lines };
      }
      size -= 2;
    }
  }

  private wrap(ctx: Ctx, text: string, maxWidth: number) {
    const lines: string[] = [];
    let line = '';
    const push = (word: string) => {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth) {
        line = candidate;
        return;
      }
      if (line) {
        lines.push(line);
        line = '';
      }
      // a single word wider than the line (or text without spaces, such as
      // Chinese) is broken between characters
      if (ctx.measureText(word).width <= maxWidth) {
        line = word;
        return;
      }
      for (const char of Array.from(word)) {
        if (ctx.measureText(line + char).width > maxWidth && line) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
    };
    text.split(' ').filter(Boolean).forEach(push);
    if (line) {
      lines.push(line);
    }
    return lines.length ? lines : [''];
  }

  private ellipsize(ctx: Ctx, text: string, maxWidth: number) {
    if (ctx.measureText(text).width <= maxWidth) {
      return text;
    }
    let cut = Array.from(text.replace(/\u2026$/, ''));
    while (cut.length > 1 && ctx.measureText(cut.join('') + '\u2026').width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    return cut.join('').trimEnd() + '\u2026';
  }
}

interface Scene {
  ctx: Ctx;
  w: number;
  h: number;
  u: number;
  family: string;
  primary: string;
  accent: string;
  brand: RenderBrand;
  logo: Image | null;
  hook: string;
  subtext: string;
  story: boolean;
}
