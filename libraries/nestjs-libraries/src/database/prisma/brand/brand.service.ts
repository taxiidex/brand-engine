import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { BrandRepository } from '@gitroom/nestjs-libraries/database/prisma/brand/brand.repository';
import { BrandScraper } from '@gitroom/nestjs-libraries/database/prisma/brand/brand.scraper';
import { OpenaiService } from '@gitroom/nestjs-libraries/openai/openai.service';
import {
  BRAND_TONES,
  BrandProfileDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.dto';

// A website is read and analysed, but nothing is saved until the user has
// looked at the result and saved it themselves
export interface BrandDraft {
  businessName: string;
  websiteUrl: string;
  niche: string;
  description: string;
  tone: string;
  language: string;
  targetTopics: string[];
  keywords: string[];
  hashtags: string[];
  primaryColor?: string;
  accentColor?: string;
  fontFamily?: string;
  logoUrl?: string;
  ctaText: string;
  ctaUrl: string;
  aiGenerated: boolean;
}

const clean = (list: string[] | undefined, max: number, length: number) =>
  Array.from(
    new Set(
      (list || [])
        .map((v) => String(v).replace(/\s+/g, ' ').trim().slice(0, length))
        .filter(Boolean)
    )
  ).slice(0, max);

@Injectable()
export class BrandService {
  private readonly _logger = new Logger(BrandService.name);

  constructor(
    private _brandRepository: BrandRepository,
    private _brandScraper: BrandScraper,
    private _openaiService: OpenaiService
  ) {}

  getBrand(orgId: string) {
    return this._brandRepository.getBrand(orgId);
  }

  saveBrand(orgId: string, body: BrandProfileDto) {
    return this._brandRepository.saveBrand(orgId, body);
  }

  async analyzeWebsite(url: string): Promise<BrandDraft> {
    const site = await this._brandScraper.scrape(url);
    if (!site) {
      throw new BadRequestException(
        'We could not read that website. Check the address and that the site is public.'
      );
    }

    let ai: Awaited<ReturnType<OpenaiService['analyzeBrand']>> = undefined;
    try {
      ai = await this._openaiService.analyzeBrand(site);
    } catch (err) {
      // The scraped details are still worth returning when the AI is down or
      // not configured, the user can fill in the rest by hand
      this._logger.warn(`Brand analysis failed for ${site.url}: ${err}`);
    }

    const fallbackName =
      site.siteName || site.title.split(/\s[|\-–—·:]\s/)[0] || '';

    return {
      businessName: (ai?.businessName || fallbackName).trim().slice(0, 100),
      websiteUrl: site.url,
      niche: (ai?.niche || '').trim().slice(0, 120),
      description: (ai?.description || site.description || '')
        .trim()
        .slice(0, 1000),
      tone: ai?.tone && BRAND_TONES.includes(ai.tone) ? ai.tone : 'friendly',
      language: /^[a-z]{2,3}$/.test((ai?.language || '').toLowerCase())
        ? ai!.language.toLowerCase()
        : 'en',
      targetTopics: clean(ai?.targetTopics, 8, 80),
      keywords: clean(ai?.keywords, 15, 80),
      hashtags: clean(
        (ai?.hashtags || []).map((h) =>
          h.replace(/^#/, '').replace(/[^\p{L}\p{N}_]/gu, '')
        ),
        10,
        60
      ),
      primaryColor: site.primaryColor,
      accentColor: site.accentColor,
      fontFamily: site.fontFamily,
      logoUrl: site.logoUrl,
      ctaText: (ai?.ctaText || '').trim().slice(0, 60),
      ctaUrl: site.url,
      aiGenerated: !!ai,
    };
  }
}
