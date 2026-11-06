import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { RacingService } from './racing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('racing')
export class RacingController {
  constructor(private readonly racingService: RacingService) {}

  @Get('cars')
  getCars() {
    return this.racingService.getCars();
  }

  @Get('cars/:id')
  getCar(@Param('id') id: string) {
    return this.racingService.getCarById(id);
  }

  @Get('results/recent')
  getRecentResults(@Query('limit') limit: number = 20) {
    return this.racingService.getRecentResults(Number(limit));
  }

  @Get('results/:id')
  getResultById(@Param('id') id: string) {
    return this.racingService.getResultById(id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history')
  getUserRaceHistory(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.racingService.getUserRaceHistory(userId, Number(limit));
  }
}
