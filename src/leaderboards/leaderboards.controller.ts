import { Controller, Get, Query } from '@nestjs/common';
import { LeaderboardsService } from './leaderboards.service';

@Controller('leaderboards')
export class LeaderboardsController {
  constructor(private readonly leaderboardsService: LeaderboardsService) {}

  @Get('global')
  async getGlobal(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.leaderboardsService.getGlobalLeaderboard(lim);
  }

  @Get('ranked')
  async getRanked(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.leaderboardsService.getRankedLeaderboard(lim);
  }

  @Get('country')
  async getCountry(@Query('country') country?: string, @Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.leaderboardsService.getCountryLeaderboard(country || 'BD', lim);
  }
}
