import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
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
  ComposeDto,
  GeneratePostDto,
  PublishPostDto,
  RenderPostDto,
  TopicStateDto,
  TopicTitleDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.post.dto';
import {
  ComposeInput,
  EngineService,
} from '@gitroom/nestjs-libraries/database/prisma/brand/engine.service';
import { DesignSize } from '@gitroom/nestjs-libraries/render/design.renderer';
import {
  GenerateBrandVideoDto,
  VideoSearchDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.video.dto';
import { VideoSize } from '@gitroom/nestjs-libraries/render/video.renderer';

@ApiTags('Brand')
@Controller('/brand')
export class BrandController {
  constructor(
    private _brandService: BrandService,
    private _engineService: EngineService
  ) {}

  // ---- the content engine ----

  // Writes a new post: topic, angle, vibe, hooks, caption per network
  @Post('/compose')
  @Throttle({ default: { limit: 120, ttl: 3600000 } })
  async compose(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ComposeDto
  ) {
    return this._engineService.compose(org.id, body as ComposeInput);
  }

  // Designs the image(s) of a composed post
  @Post('/posts/:id/render')
  @Throttle({ default: { limit: 240, ttl: 3600000 } })
  async renderPost(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: RenderPostDto
  ) {
    return this._engineService.render(org.id, id, {
      layout: body.layout,
      newDesign: body.newDesign,
      photoUrl: body.photoUrl,
      size: body.size as DesignSize | undefined,
      headline: body.headline,
      subtext: body.subtext,
    });
  }

  // The LinkedIn, Instagram and X versions of a composed post
  @Post('/posts/:id/versions')
  @Throttle({ default: { limit: 240, ttl: 3600000 } })
  async postVersions(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._engineService.versions(org.id, id);
  }

  @Get('/topics')
  async listTopics(@GetOrgFromRequest() org: Organization) {
    return this._engineService.listTopics(org.id);
  }

  @Post('/topics')
  async addTopic(
    @GetOrgFromRequest() org: Organization,
    @Body() body: TopicTitleDto
  ) {
    return this._engineService.addTopic(org.id, body.title);
  }

  // Reads the website again and rebuilds the topics taken from it
  @Post('/topics/refresh')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  async refreshTopics(@GetOrgFromRequest() org: Organization) {
    return this._engineService.refreshTopics(org.id);
  }

  @Put('/topics/:id')
  async updateTopic(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string,
    @Body() body: TopicStateDto
  ) {
    return this._engineService.updateTopic(org.id, id, body);
  }

  @Delete('/topics/:id')
  async deleteTopic(
    @GetOrgFromRequest() org: Organization,
    @Param('id') id: string
  ) {
    return this._engineService.deleteTopic(org.id, id);
  }

  @Get('/stock-videos')
  @Throttle({ default: { limit: 60, ttl: 3600000 } })
  async searchVideos(@Query() query: VideoSearchDto) {
    return this._brandService.searchVideos(
      query.query,
      (query.size as VideoSize) || 'story'
    );
  }

  // Renders a branded video; heavy, so it is limited more than the rest
  @Post('/video')
  @Throttle({ default: { limit: 30, ttl: 3600000 } })
  async generateVideo(
    @GetOrgFromRequest() org: Organization,
    @Body() body: GenerateBrandVideoDto
  ) {
    return this._brandService.generateVideo(org.id, body);
  }

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
