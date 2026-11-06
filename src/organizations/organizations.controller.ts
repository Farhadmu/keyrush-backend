import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Patch,
  Delete,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgsService: OrganizationsService) {}

  @Get()
  getAll() {
    return this.orgsService.getAllOrganizations();
  }

  @Get(':slug')
  getBySlug(@Param('slug') slug: string) {
    return this.orgsService.getOrganizationBySlug(slug);
  }

  @Get(':slug/members')
  getMembers(@Param('slug') slug: string) {
    return this.orgsService.getMembers(slug);
  }

  @Get(':slug/teams')
  getTeams(@Param('slug') slug: string) {
    return this.orgsService.getTeams(slug);
  }

  @Get(':slug/analytics')
  getAnalytics(@Param('slug') slug: string) {
    return this.orgsService.getAnalytics(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(
    @CurrentUser('userId') userId: string,
    @Body() body: any,
  ) {
    return this.orgsService.createOrganization(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/join')
  requestJoin(
    @Param('id') orgId: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.orgsService.requestJoin(orgId, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/members/:memberId/approve')
  approveMember(
    @Param('id') orgId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.orgsService.approveMember(orgId, adminUserId, memberId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/members/:memberId')
  removeMember(
    @Param('id') orgId: string,
    @Param('memberId') memberId: string,
    @CurrentUser('userId') adminUserId: string,
  ) {
    return this.orgsService.removeMember(orgId, adminUserId, memberId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/teams')
  createTeam(
    @Param('id') orgId: string,
    @CurrentUser('userId') captainUserId: string,
    @Body() body: { name: string; tag: string; description?: string },
  ) {
    return this.orgsService.createTeam(orgId, captainUserId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post('teams/:teamId/members')
  addTeamMember(
    @Param('teamId') teamId: string,
    @CurrentUser('userId') callerUserId: string,
    @Body('userId') targetUserId: string,
  ) {
    return this.orgsService.addTeamMember(teamId, callerUserId, targetUserId);
  }
}
