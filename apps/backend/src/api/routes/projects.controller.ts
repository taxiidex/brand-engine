import { Body, Controller, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Organization, User } from '@prisma/client';
import { GetOrgFromRequest } from '@gitroom/nestjs-libraries/user/org.from.request';
import { GetUserFromRequest } from '@gitroom/nestjs-libraries/user/user.from.request';
import { ProjectService } from '@gitroom/nestjs-libraries/database/prisma/projects/project.service';
import { ProjectNameDto } from '@gitroom/nestjs-libraries/dtos/projects/project.dto';

// Listing projects and switching between them reuse the existing
// /user/organizations and /user/change-org endpoints.
@ApiTags('Projects')
@Controller('/projects')
export class ProjectsController {
  constructor(private _projectService: ProjectService) {}

  @Post('/')
  createProject(
    @GetUserFromRequest() user: User,
    @Body() body: ProjectNameDto
  ) {
    return this._projectService.createProject(user.id, body.name);
  }

  @Put('/current')
  renameCurrentProject(
    @GetOrgFromRequest() org: Organization,
    @Body() body: ProjectNameDto
  ) {
    return this._projectService.renameProject(org.id, body.name);
  }
}
