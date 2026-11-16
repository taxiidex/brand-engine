import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brand/brand.service';
import {
  AnalyzeWebsiteDto,
  BrandProfileDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.dto';
import {
  GenerateBrandImageDto,
  StockSearchDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.image.dto';
import { ImageSize } from '@gitroom/nestjs-libraries/render/image.renderer';
import {
  GeneratePostDto,
  PublishPostDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.post.dto';

@ApiTags('Brand')
@Controller('/brand')
export class BrandController {
  constructor(private _brandService: BrandService) {}

  @Get('/')
  async getBrand(@GetOrgFromRequest() org: Organization) {
    return (await this._brandService.getBrand(org.id)) || null;
  }

  @Post('/')
  async saveBrand(
    @GetOrgFromRequest() org: Organization,
    @Body() body: BrandProfileDto
  ) {
    return this._brandService.saveBrand(org.id, body);
  }

  // Reads a website and costs an AI call, so it is rate limited per user
  @Post('/analyze')
  @Throttle({ default: { limit: 20, ttl: 3600000 } })
  async analyzeWebsite(@Body() body: AnalyzeWebsiteDto) {
    return this._brandService.analyzeWebsite(body.url);
  }

  @Get('/stock')
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async searchPhotos(@Query() query: StockSearchDto) {
    return this._brandService.searchPhotos(
      query.query,
      (query.size as ImageSize) || 'feed'
    );
  }

  @Post('/image')
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async generateImage(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GenerateBrandImageDto
  ) {
    return this._brandService.generateImage(org.id, body);
  }

  // Writes a post with our AI and renders its image; nothing is saved yet
  @Post('/generate')
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  async generatePost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GeneratePostDto
  ) {
    return this._brandService.generatePost(org.id, body);
  }

  // Sends a post to the chosen accounts: now, at a time, or as a draft
  @Post('/posts')
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  async publishPost(
    @GetOrgFromRequest() org: Organization,
    @Body() body: PublishPostDto
  ) {
    return this._brandService.publishPost(org.id, body);
  }
}
