import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { TypingService } from './typing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('typing')
export class TypingController {
  constructor(private readonly typingService: TypingService) {}

  @Get('passages/random')
  getRandomPassage(
    @Query('language') language?: string,
    @Query('difficulty') difficulty?: string,
  ) {
    return this.typingService.getRandomPassage(language, difficulty);
  }

  @Get('passages')
  getAllPassages(@Query('language') language?: string) {
    return this.typingService.getAllPassages(language);
  }

  @UseGuards(JwtAuthGuard)
  @Post('practice/record')
  recordPractice(
    @CurrentUser('userId') userId: string,
    @Body() body: any,
  ) {
    return this.typingService.recordPracticeSession({
      ...body,
      userId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Get('practice/history')
  getPracticeHistory(
    @CurrentUser('userId') userId: string,
    @Query('limit') limit: number = 20,
  ) {
    return this.typingService.getUserPracticeHistory(userId, Number(limit));
  }

  @UseGuards(JwtAuthGuard)
  @Get('practice/weaknesses')
  getUserWeaknesses(@CurrentUser('userId') userId: string) {
    return this.typingService.getUserWeaknesses(userId);
  }
}
