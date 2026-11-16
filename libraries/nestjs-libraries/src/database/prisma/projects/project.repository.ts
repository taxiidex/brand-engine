import { PrismaRepository } from '@gitroom/nestjs-libraries/database/prisma/prisma.service';
import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthService } from '@gitroom/helpers/auth/auth.service';
import { makeSecureId } from '@gitroom/nestjs-libraries/services/make.secure.id';

// A project is one business: its brand, its connected accounts and its
// posts. Underneath it is a Postiz organization, so scheduling and
// publishing keep working unchanged.
@Injectable()
export class ProjectRepository {
  constructor(private _organization: PrismaRepository<'organization'>) {}

  countOwnedProjects(userId: string) {
    return this._organization.model.organization.count({
      where: {
        deletedAt: null,
        users: { some: { userId, role: Role.SUPERADMIN, disabled: false } },
      },
    });
  }

  createProject(userId: string, name: string) {
    return this._organization.model.organization.create({
      data: {
        name,
        apiKey: AuthService.fixedEncryption(makeSecureId(20)),
        allowTrial: true,
        isTrailing: true,
        users: {
          create: {
            role: Role.SUPERADMIN,
            user: { connect: { id: userId } },
          },
        },
      },
      select: { id: true, name: true },
    });
  }

  renameProject(orgId: string, name: string) {
    return this._organization.model.organization.update({
      where: { id: orgId },
      data: { name },
      select: { id: true, name: true },
    });
  }
}
