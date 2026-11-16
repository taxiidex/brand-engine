import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { VIDEO_SIZES } from '@gitroom/nestjs-libraries/render/video.renderer';

const SIZES = Object.keys(VIDEO_SIZES);

// clips are only taken from the stock providers' own video hosts
export const STOCK_VIDEO_URL =
  /^https:\/\/(cdn\.pixabay\.com|videos\.pexels\.com)\//;

export class VideoSearchDto {
  @IsString()
  @IsDefined()
  @MinLength(2)
  @MaxLength(80)
  query: string;

  @IsOptional()
  @IsIn(SIZES)
  size?: string;
}

export class GenerateBrandVideoDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(220)
  headline: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtext?: string;

  @IsIn(SIZES)
  size: string;

  // what to search for when no clip was picked
  @IsOptional()
  @IsString()
  @MaxLength(80)
  videoQuery?: string;

  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Matches(STOCK_VIDEO_URL, {
    message: 'videoUrl must be a clip from the stock video search',
  })
  @MaxLength(600)
  videoUrl?: string;
}
