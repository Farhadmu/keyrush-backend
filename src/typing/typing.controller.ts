import { Controller, Get, Query, Param } from '@nestjs/common';
import { TypingService } from './typing.service';

@Controller('typing')
export class TypingController {
  constructor(private readonly typingService: TypingService) {}

  @Get('passages/random')
  async getRandomPassage(
    @Query('language') language?: string,
    @Query('difficulty') difficulty?: string,
  ) {
    return this.typingService.getRandomPassage(language, difficulty);
  }

  @Get('passages/:id')
  async getPassageById(@Param('id') id: string) {
    return this.typingService.getPassageById(id);
  }
}
