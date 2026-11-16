import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
} from 'class-validator';
import {
  IMAGE_SIZES,
  IMAGE_TEMPLATES,
} from '@gitroom/nestjs-libraries/render/image.renderer';

export const POST_STYLES = [...IMAGE_TEMPLATES, 'text'] as const;
export type PostStyle = (typeof POST_STYLES)[number];

export const STOCK_PHOTO_URL =
  /^https:\/\/(images\.pexels\.com|([a-z0-9-]+\.)?pixabay\.com)\//;

export class GeneratePostDto {
  // what the post is about; empty means "pick one of my topics"
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @IsIn(POST_STYLES as unknown as string[])
  style: string;

  @IsOptional()
  @IsIn(Object.keys(IMAGE_SIZES))
  size?: string;

  // provider identifiers of the channels the post is for (facebook, x, ...),
  // used to shape the length of the text
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  channels?: string[];

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Matches(STOCK_PHOTO_URL, {
    message: 'photoUrl must be a photo from the stock photo search',
  })
  @MaxLength(500)
  photoUrl?: string;

  // return the text only; the image is requested separately
  @IsOptional()
  @IsBoolean()
  skipImage?: boolean;
}

// A generated (and possibly edited) post, sent to the client's channels
export class PublishPostDto {
  // ids of the connected channels (Postiz integrations)
  @IsArray()
  @ArrayMinSize(1, { message: 'Pick at least one account to post to.' })
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  integrations: string[];

  @IsIn(['now', 'schedule', 'draft'])
  type: 'now' | 'schedule' | 'draft';

  // required for schedule, optional for a draft
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsString()
  @IsDefined()
  @MaxLength(5000)
  caption: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortCaption?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  hashtags?: string[];

  @IsIn(POST_STYLES as unknown as string[])
  style: string;

  @IsOptional()
  @IsIn(Object.keys(IMAGE_SIZES))
  size?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtext?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Matches(STOCK_PHOTO_URL, {
    message: 'photoUrl must be a photo from the stock photo search',
  })
  @MaxLength(500)
  photoUrl?: string;
}
