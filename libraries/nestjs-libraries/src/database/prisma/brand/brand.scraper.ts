import { Injectable } from '@nestjs/common';
import { JSDOM, VirtualConsole } from 'jsdom';
import { getSsrfSafeDispatcher } from '@gitroom/nestjs-libraries/dtos/webhooks/ssrf.safe.dispatcher';

export interface ScrapedSite {
  url: string;
  title: string;
  siteName: string;
  description: string;
  headings: string[];
  text: string;
  logoUrl?: string;
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
}

const MAX_HTML_BYTES = 1_500_000;
const MAX_CSS_BYTES = 400_000;
const MAX_STYLESHEETS = 4;

// Built at runtime: unicode property escapes in a regex literal need a newer
// TypeScript target than the one this repository compiles to
const FONT_NAME = new RegExp('^[\\p{L}\\p{N} _-]+$', 'u');

const GENERIC_FONTS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
  'inherit',
  'initial',
  'unset',
  'revert',
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'helvetica',
  'helvetica neue',
  'arial',
  'times',
  'times new roman',
  'courier new',
  'courier',
  'georgia',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'emoji',
  'apple color emoji',
  'segoe ui emoji',
  'noto color emoji',
]);

type Rgb = [number, number, number];

function toHex([r, g, b]: Rgb) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function parseColor(raw: string): Rgb | undefined {
  const value = raw.trim().toLowerCase();
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((c) => c + c)
            .join('')
        : hex[1];
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const rgb = value.match(/^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/);
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  return undefined;
}

function hsl([r, g, b]: Rgb): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) {
    return [0, 0, l];
  }
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) {
    h = ((gn - bn) / d) % 6;
  } else if (max === gn) {
    h = (bn - rn) / d + 2;
  } else {
    h = (rn - gn) / d + 4;
  }
  return [(h * 60 + 360) % 360, s, l];
}

// A brand colour is something you would notice: not white, black or grey
function isColourful(rgb: Rgb) {
  const [, s, l] = hsl(rgb);
  return s >= 0.25 && l >= 0.12 && l <= 0.9;
}

function hueDistance(a: Rgb, b: Rgb) {
  const diff = Math.abs(hsl(a)[0] - hsl(b)[0]);
  return Math.min(diff, 360 - diff);
}

@Injectable()
export class BrandScraper {
  async scrape(url: string): Promise<ScrapedSite | undefined> {
    const page = await this.fetchText(url, MAX_HTML_BYTES, 'text/html');
    if (!page) {
      return undefined;
    }

    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', () => undefined);
    // No runScripts and no resources: the page is parsed, never executed
    const dom = new JSDOM(page.text, { url: page.url, virtualConsole });
    const doc = dom.window.document;

    const meta = (name: string) =>
      doc
        .querySelector(`meta[property="${name}"], meta[name="${name}"]`)
        ?.getAttribute('content')
        ?.trim() || '';

    const jsonLd = this.readJsonLdOrganization(doc);

    const headings = Array.from(doc.querySelectorAll('h1, h2'))
      .map((h) => (h.textContent || '').replace(/\s+/g, ' ').trim())
      .filter((h, i, all) => !!h && all.indexOf(h) === i)
      .map((h) => h.slice(0, 140))
      .slice(0, 15);

    const logoUrl = this.findLogo(doc, page.url, jsonLd?.logo);
    const styles = await this.loadStyles(doc, page.url);
    const css = styles.join('\n');
    const colors = this.pickColors(css, meta('theme-color'));
    const fontFamily = this.pickFont(css, doc);

    doc
      .querySelectorAll('script, style, noscript, svg, iframe, form')
      .forEach((el) => el.remove());
    // textContent glues neighbouring elements together ("priceBook")
    doc.body
      ?.querySelectorAll('*')
      .forEach((el) => el.append(doc.createTextNode(' ')));
    const text = (doc.body?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000);

    return {
      url: page.url,
      title: (doc.title || '').replace(/\s+/g, ' ').trim().slice(0, 200),
      siteName:
        meta('og:site_name') || meta('application-name') || jsonLd?.name || '',
      description: meta('og:description') || meta('description'),
      headings,
      text,
      logoUrl,
      primaryColor: colors.primary,
      accentColor: colors.accent,
      fontFamily,
    };
  }

  // Every request, including each redirect hop, is pinned to the SSRF-safe
  // dispatcher, and the body is cut off at maxBytes
  private async fetchText(url: string, maxBytes: number, accept: string) {
    try {
      const res = await fetch(url, {
        // @ts-ignore undici option, not in lib.dom fetch types
        dispatcher: getSsrfSafeDispatcher(),
        redirect: 'follow',
        signal: AbortSignal.timeout(10_000),
        headers: {
          'user-agent': 'Mozilla/5.0 (compatible; BrandEngineBot/1.0)',
          accept,
        },
      });
      if (!res.ok || !res.body) {
        return undefined;
      }
      const type = res.headers.get('content-type') || '';
      if (accept === 'text/html' && !/html|xml/i.test(type)) {
        return undefined;
      }
      const reader = res.body.getReader();
      const chunks: Uint8Array[] = [];
      let total = 0;
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done || !value) {
          break;
        }
        chunks.push(value);
        total += value.length;
      }
      await reader.cancel().catch(() => undefined);
      return {
        text: Buffer.concat(chunks).toString('utf8'),
        url: res.url || url,
      };
    } catch (err) {
      return undefined;
    }
  }

  private readJsonLdOrganization(doc: Document) {
    for (const el of Array.from(
      doc.querySelectorAll('script[type="application/ld+json"]')
    )) {
      try {
        const data = JSON.parse(el.textContent || '');
        const nodes: any[] = Array.isArray(data)
          ? data
          : data?.['@graph']
          ? data['@graph']
          : [data];
        const org = nodes.find((n) =>
          /Organization|LocalBusiness|Corporation|Store/i.test(
            ([] as string[]).concat(n?.['@type'] || []).join(' ')
          )
        );
        if (org) {
          const logo =
            typeof org.logo === 'string' ? org.logo : org.logo?.url || '';
          return { name: String(org.name || ''), logo: String(logo || '') };
        }
      } catch (err) {
        // malformed structured data is common, skip it
      }
    }
    return undefined;
  }

  private absolute(href: string | null | undefined, base: string) {
    if (!href) {
      return undefined;
    }
    try {
      const u = new URL(href, base);
      return u.protocol === 'https:' || u.protocol === 'http:'
        ? u.toString()
        : undefined;
    } catch (err) {
      return undefined;
    }
  }

  private findLogo(doc: Document, base: string, jsonLdLogo?: string) {
    const candidates: (string | null | undefined)[] = [jsonLdLogo];

    const logoImage = Array.from(doc.querySelectorAll('img')).find((img) =>
      /logo/i.test(
        [
          img.getAttribute('alt'),
          img.getAttribute('class'),
          img.getAttribute('id'),
          img.getAttribute('src'),
        ].join(' ')
      )
    );
    candidates.push(logoImage?.getAttribute('src'));

    const touch = Array.from(
      doc.querySelectorAll('link[rel~="apple-touch-icon"]')
    )
      .map((l) => ({
        href: l.getAttribute('href'),
        size: parseInt((l.getAttribute('sizes') || '0').split('x')[0], 10) || 0,
      }))
      .sort((a, b) => b.size - a.size)[0];
    candidates.push(touch?.href);
    candidates.push(
      doc.querySelector('link[rel~="icon"]')?.getAttribute('href')
    );
    candidates.push(
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
    );

    for (const candidate of candidates) {
      const url = this.absolute(candidate, base);
      if (url) {
        return url;
      }
    }
    return undefined;
  }

  // Inline <style> blocks plus a few linked stylesheets from the site itself
  // (and Google Fonts, which names the fonts the site uses)
  private async loadStyles(doc: Document, base: string) {
    const styles = Array.from(doc.querySelectorAll('style')).map(
      (s) => s.textContent || ''
    );
    const host = new URL(base).hostname;
    const links = Array.from(doc.querySelectorAll('link[rel~="stylesheet"]'))
      .map((l) => this.absolute(l.getAttribute('href'), base))
      .filter((l): l is string => !!l)
      .filter((l) => {
        const h = new URL(l).hostname;
        return h === host || h === 'fonts.googleapis.com';
      })
      .slice(0, MAX_STYLESHEETS);

    const loaded = await Promise.all(
      links.map((l) => this.fetchText(l, MAX_CSS_BYTES, 'text/css'))
    );
    return [...styles, ...loaded.map((l) => l?.text || ''), ...links];
  }

  private pickColors(css: string, themeColor: string) {
    const weights = new Map<string, { rgb: Rgb; weight: number }>();
    const add = (raw: string, weight: number) => {
      const rgb = parseColor(raw);
      if (!rgb) {
        return;
      }
      const key = toHex(rgb);
      const current = weights.get(key);
      weights.set(key, { rgb, weight: (current?.weight || 0) + weight });
    };

    for (const m of css.matchAll(
      /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*\d{1,3}[\s,]+\d{1,3}[\s,]+\d{1,3}/g
    )) {
      add(m[0].startsWith('rgb') ? m[0] + ')' : m[0], 1);
    }

    // A variable called --primary, --brand or --accent says it outright
    for (const m of css.matchAll(
      /--[\w-]*(?:primary|brand|accent|theme)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,6}\b|rgba?\(\s*\d{1,3}[\s,]+\d{1,3}[\s,]+\d{1,3})/gi
    )) {
      add(m[1].startsWith('rgb') ? m[1] + ')' : m[1], 25);
    }

    if (themeColor) {
      add(themeColor, 40);
    }

    const ranked = Array.from(weights.values())
      .filter((c) => isColourful(c.rgb))
      .sort((a, b) => b.weight - a.weight);

    const primary = ranked[0];
    const accent = ranked.find(
      (c) => primary && c !== primary && hueDistance(c.rgb, primary.rgb) >= 25
    );

    return {
      primary: primary ? toHex(primary.rgb) : undefined,
      accent: accent ? toHex(accent.rgb) : undefined,
    };
  }

  private pickFont(css: string, doc: Document) {
    const counts = new Map<string, number>();
    const add = (name: string, weight: number) => {
      const clean = name.replace(/["']/g, '').trim();
      if (
        !clean ||
        clean.length > 60 ||
        GENERIC_FONTS.has(clean.toLowerCase()) ||
        !FONT_NAME.test(clean)
      ) {
        return;
      }
      counts.set(clean, (counts.get(clean) || 0) + weight);
    };

    for (const m of css.matchAll(/font-family\s*:\s*([^;}{]+)/gi)) {
      if (/var\(|\\/.test(m[1])) {
        continue;
      }
      add(m[1].split(',')[0], 1);
    }

    const googleHrefs = [
      css,
      ...Array.from(
        doc.querySelectorAll('link[href*="fonts.googleapis.com"]')
      ).map((l) => l.getAttribute('href') || ''),
    ].join('\n');
    for (const m of googleHrefs.matchAll(/family=([^&:;"')]+)/g)) {
      try {
        add(decodeURIComponent(m[1]).replace(/\+/g, ' '), 20);
      } catch (err) {
        // ignore a broken url encoding
      }
    }

    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
  }
}
