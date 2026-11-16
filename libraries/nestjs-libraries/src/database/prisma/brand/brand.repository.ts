import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { BrandProfileDto } from '@gitroom/nestjs-libraries/dtos/brand/brand.dto';

@Injectable()
export class BrandRepository {
  constructor(private _brandProfile: PrismaRepository<'brandProfile'>) {}

  getBrand(orgId: string) {
    return this._brandProfile.model.brandProfile.findUnique({
      where: {
        organizationId: orgId,
      },
    });
  }

  saveBrand(orgId: string, body: BrandProfileDto) {
    const data = {
      businessName: body.businessName,
      websiteUrl: body.websiteUrl || null,
      niche: body.niche,
      description: body.description || null,
      tone: body.tone,
      language: body.language,
      targetTopics: body.targetTopics,
      keywords: body.keywords,
      hashtags: body.hashtags.map((h) => h.replace(/^#/, '')),
      primaryColor: body.primaryColor,
      accentColor: body.accentColor,
      fontFamily: body.fontFamily,
      logoUrl: body.logoUrl || null,
      ctaText: body.ctaText || null,
      ctaUrl: body.ctaUrl || null,
    };

    return this._brandProfile.model.brandProfile.upsert({
      where: {
        organizationId: orgId,
      },
      create: {
        organizationId: orgId,
        ...data,
      },
      update: data,
    });
  }
}
