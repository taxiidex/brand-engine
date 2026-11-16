import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  IMAGE_SIZES,
  IMAGE_TEMPLATES,
} from '@gitroom/nestjs-libraries/render/image.renderer';

const SIZES = Object.keys(IMAGE_SIZES);

export class StockSearchDto {
  @IsString()
  @IsDefined()
  @MinLength(2)
  @MaxLength(80)
  query: string;

  @IsOptional()
  @IsIn(SIZES)
  size?: string;
}

export class GenerateBrandImageDto {
  @IsString()
  @IsDefined()
  @MinLength(1)
  @MaxLength(220)
  hook: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subtext?: string;

  @IsIn(IMAGE_TEMPLATES as unknown as string[])
  template: string;

  @IsIn(SIZES)
  size: string;

  // What to search for when no photo was picked
  @IsOptional()
  @IsString()
  @MaxLength(80)
  photoQuery?: string;

  // A photo picked from the search results. Only the stock providers' own
  // image hosts are accepted, and they are checked again when it is
  // downloaded.
  @IsOptional()
  @IsUrl({ require_protocol: true, protocols: ['https'] })
  @Matches(/^https:\/\/(images\.pexels\.com|([a-z0-9-]+\.)?pixabay\.com)\//)
  @MaxLength(500)
  photoUrl?: string;

  // false (the default) only returns a preview, true also saves the image to
  // the media library
  @IsOptional()
  @IsBoolean()
  save?: boolean;
}
