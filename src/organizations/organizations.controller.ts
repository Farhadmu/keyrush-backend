import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly orgService: OrganizationsService) {}

  @Get()
  async getAll() {
    return this.orgService.getAllOrganizations();
  }

  @Get(':slug')
  async getBySlug(@Param('slug') slug: string) {
    return this.orgService.getOrganizationBySlug(slug);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(
    @CurrentUser('userId') userId: string,
    @Body() body: { name: string; type?: string; country?: string; website?: string },
  ) {
    return this.orgService.createOrganization(userId, body);
  }
}
