import { Controller, Post, Get, Body, UseGuards, Query } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';

@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @UseGuards(JwtAuthGuard)
  @Post('coaching')
  async getCoaching(
    @CurrentUser('userId') userId: string,
    @Body('history') history: any[],
  ) {
    return this.aiService.generateCoachingReport(userId, history);
  }

  @UseGuards(JwtAuthGuard)
  @Post('weaknesses')
  async getWeaknesses(
    @CurrentUser('userId') userId: string,
    @Body('keyMissMap') keyMissMap: Record<string, number>,
  ) {
    return this.aiService.analyzeWeaknesses(userId, keyMissMap);
  }

  @UseGuards(JwtAuthGuard)
  @Get('practice-plan')
  async getPracticePlan(
    @CurrentUser('userId') userId: string,
    @Query('level') level: number = 1,
    @Query('avgWpm') avgWpm: number = 50,
  ) {
    return this.aiService.generatePracticePlan(userId, Number(level), Number(avgWpm));
  }

  @Post('generate-passage')
  async generatePassage(
    @Body() body: { language?: string; difficulty?: string; topic?: string },
  ) {
    return this.aiService.generatePassage({
      language: body.language || 'EN',
      difficulty: body.difficulty || 'MEDIUM',
      topic: body.topic || 'TECH',
    });
  }
}
