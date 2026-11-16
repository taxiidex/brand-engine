import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';

// Topic pool and post history of a brand
@Injectable()
export class BrandContentRepository {
  constructor(
    private _topics: PrismaRepository<'brandTopic'>,
    private _posts: PrismaRepository<'brandPost'>
  ) {}

  // ---- topics ----

  listTopics(orgId: string) {
    return this._topics.model.brandTopic.findMany({
      where: { organizationId: orgId },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'asc' }],
    });
  }

  // Replaces the topics read from the website, keeping the client's own
  // topics and anything pinned or muted
  async replaceWebsiteTopics(
    orgId: string,
    topics: { title: string; kind: string; sourceUrl?: string; facts: string[] }[]
  ) {
    const existing = await this.listTopics(orgId);
    const kept = existing.filter(
      (t) => t.kind === 'custom' || t.pinned || t.muted
    );
    const keptTitles = new Set(kept.map((t) => t.title.toLowerCase()));
    await this._topics.model.brandTopic.deleteMany({
      where: {
        organizationId: orgId,
        id: { notIn: kept.map((t) => t.id) },
      },
    });
    const fresh = topics.filter((t) => !keptTitles.has(t.title.toLowerCase()));
    if (fresh.length) {
      await this._topics.model.brandTopic.createMany({
        data: fresh.map((t) => ({
          organizationId: orgId,
          title: t.title,
          kind: t.kind,
          sourceUrl: t.sourceUrl || null,
          facts: t.facts,
        })),
      });
    }
    return this.listTopics(orgId);
  }

  addTopic(orgId: string, title: string) {
    return this._topics.model.brandTopic.create({
      data: { organizationId: orgId, title, kind: 'custom', facts: [] },
    });
  }

  updateTopic(
    orgId: string,
    id: string,
    data: { pinned?: boolean; muted?: boolean }
  ) {
    return this._topics.model.brandTopic.updateMany({
      where: { id, organizationId: orgId },
      data,
    });
  }

  deleteTopic(orgId: string, id: string) {
    return this._topics.model.brandTopic.deleteMany({
      where: { id, organizationId: orgId },
    });
  }

  // ---- post history ----

  recentPosts(orgId: string, take = 30) {
    return this._posts.model.brandPost.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  // captions the client kept (posted, scheduled or saved), newest first
  approvedPosts(orgId: string, take = 5) {
    return this._posts.model.brandPost.findMany({
      where: {
        organizationId: orgId,
        status: { in: ['published', 'scheduled', 'draft'] },
      },
      orderBy: { updatedAt: 'desc' },
      take,
    });
  }

  getPost(orgId: string, id: string) {
    return this._posts.model.brandPost.findFirst({
      where: { id, organizationId: orgId },
    });
  }

  createPost(
    orgId: string,
    data: Omit<Prisma.BrandPostUncheckedCreateInput, 'organizationId'>
  ) {
    return this._posts.model.brandPost.create({
      data: { ...data, organizationId: orgId },
    });
  }

  updatePost(
    orgId: string,
    id: string,
    data: Prisma.BrandPostUncheckedUpdateInput
  ) {
    return this._posts.model.brandPost.updateMany({
      where: { id, organizationId: orgId },
      data,
    });
  }
}
