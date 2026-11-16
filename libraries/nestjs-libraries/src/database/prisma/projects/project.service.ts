import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectRepository } from '@gitroom/nestjs-libraries/database/prisma/projects/project.repository';

// keeps a single account from creating an unbounded number of workspaces
const MAX_PROJECTS_PER_USER = 20;

@Injectable()
export class ProjectService {
  constructor(private _projectRepository: ProjectRepository) {}

  async createProject(userId: string, name: string) {
    if (
      (await this._projectRepository.countOwnedProjects(userId)) >=
      MAX_PROJECTS_PER_USER
    ) {
      throw new BadRequestException(
        `You can have up to ${MAX_PROJECTS_PER_USER} projects.`
      );
    }
    return this._projectRepository.createProject(userId, name.trim());
  }

  renameProject(orgId: string, name: string) {
    return this._projectRepository.renameProject(orgId, name.trim());
  }
}
