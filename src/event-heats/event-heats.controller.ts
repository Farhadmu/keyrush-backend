import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { EventHeatsService } from './event-heats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('events')
export class EventHeatsController {
  constructor(private readonly heatsService: EventHeatsService) {}

  @Get(':id/heats')
  async getHeats(@Param('id') id: string, @Query('round') round?: string) {
    const roundNumber = round ? parseInt(round, 10) : 1;
    return this.heatsService.getHeats(id, roundNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/generate-heats')
  async generateHeats(@Param('id') id: string) {
    return this.heatsService.generateHeatsForCompetition(id);
  }
}
