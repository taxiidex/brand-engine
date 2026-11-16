import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsDefined,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  IMAGE_SIZES,
  IMAGE_TEMPLATES,
} from '@gitroom/nestjs-libraries/render/image.renderer';
import {
  LAYOUTS,
  VIBES,
} from '@gitroom/nestjs-libraries/render/design.renderer';

// each version is a string of reasonable length
@ValidatorConstraint({ name: 'CaptionVersions' })
class CaptionVersions implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return false;
    }
    return Object.entries(value as Record<string, unknown>).every(
      ([key, text]) =>
        ['linkedin', 'instagram', 'facebook', 'short'].includes(key) &&
        typeof text === 'string' &&
        text.length <= 5000
    );
  }

  defaultMessage() {
    return 'captions must be texts for linkedin, instagram, facebook or short';
  }
}

export const POST_STYLES = [
  'auto',
  ...IMAGE_TEMPLATES,
  'video',
  'text',
] as const;
export type PostStyle = (typeof POST_STYLES)[number];

// the formats of a post written by the content engine
export const COMPOSE_STYLES = ['auto', 'photo', 'graphic', 'carousel', 'video', 'text'];
const PUBLISH_STYLES = Array.from(new Set([...POST_STYLES, ...COMPOSE_STYLES]));

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

  @IsIn(PUBLISH_STYLES)
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

  // for a video post: the address of the rendered video (from /brand/video)
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https', 'http'] })
  @MaxLength(600)
  videoPath?: string;

  // a post written by the content engine (/brand/compose)
  @IsOptional()
  @IsString()
  @MaxLength(64)
  postId?: string;

  // the edited text per network: linkedin, instagram, facebook, short
  @IsOptional()
  @IsObject()
  @Validate(CaptionVersions)
  captions?: Record<string, string>;
}

// Asks the content engine for a new post
export class ComposeDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  topicId?: string;

  @IsIn(COMPOSE_STYLES)
  style: string;

  @IsIn(['auto', ...VIBES])
  vibe: string;

  @IsIn(Object.keys(IMAGE_SIZES))
  size: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  channels?: string[];
}

export class RenderPostDto {
  @IsOptional()
  @IsIn(LAYOUTS.map((l) => l.id))
  layout?: string;

  // a different layout and palette for the same text
  @IsOptional()
  @IsBoolean()
  newDesign?: boolean;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Matches(STOCK_PHOTO_URL, {
    message: 'photoUrl must be a photo from the stock photo search',
  })
  @MaxLength(500)
  photoUrl?: string;

  @IsOptional()
  @IsIn(Object.keys(IMAGE_SIZES))
  size?: string;

  // the words on the image, when the client changed them
  @IsOptional()
  @IsString()
  @MaxLength(220)
  headline?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtext?: string;
}

export class TopicTitleDto {
  @IsString()
  @IsDefined()
  @MinLength(3)
  @MaxLength(120)
  title: string;
}

export class TopicStateDto {
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
