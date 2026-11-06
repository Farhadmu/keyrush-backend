import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly compService: CompetitionsService) {}

  @Get()
  async getAllCompetitions(@Query('organizationId') orgId?: string) {
    return this.compService.getAllCompetitions({ organizationId: orgId });
  }

  @Get(':id')
  async getCompetition(@Param('id') id: string) {
    return this.compService.getCompetitionByIdOrSlug(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async createCompetition(
    @CurrentUser('userId') userId: string,
    @Body()
    body: {
      title: string;
      description?: string;
      visibility?: string;
      organizationId?: string;
      minParticipants?: number;
      maxParticipants?: number;
      language?: string;
      difficulty?: string;
    },
  ) {
    return this.compService.createCompetition(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register')
  async register(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.compService.registerParticipant(id, user);
  }

  @Get(':id/registrations')
  async getRegistrations(@Param('id') id: string) {
    return this.compService.getRegistrations(id);
  }
}
