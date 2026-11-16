import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { IsSafeWebhookUrl } from '@gitroom/nestjs-libraries/dtos/webhooks/webhook.url.validator';

export const BRAND_TONES = [
  'professional',
  'friendly',
  'bold',
  'playful',
  'luxury',
  'technical',
  'inspirational',
  'authoritative',
] as const;

const trimList = ({ value }: { value: unknown }) =>
  Array.isArray(value)
    ? value
        .map((v) => (typeof v === 'string' ? v.trim() : v))
        .filter((v) => v !== '')
    : value;

// Users type "example.com" as often as "https://example.com"
const withHttps = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') {
    return value;
  }
  const url = value.trim();
  if (!url) {
    return undefined;
  }
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`;
};

// Built at runtime: unicode property escapes in a regex literal need a newer
// TypeScript target than the one this repository compiles to
const HASHTAG = new RegExp('^#?[\\p{L}\\p{N}_]{1,60}$', 'u');
const FONT_NAME = new RegExp('^[\\p{L}\\p{N} _-]+$', 'u');

export class BrandProfileDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(100)
  businessName: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  @Transform(withHttps)
  websiteUrl?: string;

  @IsString()
  @IsDefined()
  @MaxLength(120)
  niche: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsString()
  @IsIn(BRAND_TONES as unknown as string[])
  tone: string;

  @IsString()
  @Matches(/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/, {
    message: 'language must be a language code like en or pt-BR',
  })
  language: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(trimList)
  targetTopics: string[];

  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  @Transform(trimList)
  keywords: string[];

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @Matches(HASHTAG, {
    each: true,
    message: 'hashtags may only contain letters, numbers and underscores',
  })
  @Transform(trimList)
  hashtags: string[];

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'primaryColor must be a hex colour like #1A2B3C' })
  primaryColor: string;

  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'accentColor must be a hex colour like #1A2B3C' })
  accentColor: string;

  // The font name is later passed to the image and video renderers, so it is
  // restricted to plain font-name characters
  @IsString()
  @MaxLength(60)
  @Matches(FONT_NAME, {
    message: 'fontFamily may only contain letters, numbers, spaces, - and _',
  })
  fontFamily: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(1000)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaText?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true })
  @MaxLength(500)
  @Transform(withHttps)
  ctaUrl?: string;

  // facts the client vouches for: numbers, results, awards, customer quotes
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(240, { each: true })
  @Transform(trimList)
  proofPoints?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  audience?: string;
}

export class AnalyzeWebsiteDto {
  @IsString()
  @IsDefined()
  @Transform(withHttps)
  @IsSafeWebhookUrl({
    message:
      'Website must be a public HTTPS URL and cannot point to internal network addresses',
  })
  url: string;
}
