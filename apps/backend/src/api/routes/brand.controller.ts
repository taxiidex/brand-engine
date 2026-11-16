import { Body, Controller, Get, Post } from '@nestjs/common';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { Organization } from '@prisma/client';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BrandService } from '@gitroom/nestjs-libraries/database/prisma/brand/brand.service';
import {
  AnalyzeWebsiteDto,
  BrandProfileDto,
} from '@gitroom/nestjs-libraries/dtos/brand/brand.dto';

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
}
