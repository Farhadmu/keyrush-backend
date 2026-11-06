import { Controller, Get, Param, Query } from '@nestjs/common';
import { RacingService } from './racing.service';

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

  @Get('bots')
  getBots(@Query('count') count?: string, @Query('targetWpm') targetWpm?: string) {
    const numBots = count ? parseInt(count, 10) : 3;
    const wpm = targetWpm ? parseInt(targetWpm, 10) : 65;
    return this.racingService.generateBots(numBots, wpm);
  }
}
