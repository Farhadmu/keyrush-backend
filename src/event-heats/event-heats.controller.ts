import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
} from '@nestjs/common';
import { EventHeatsService } from './event-heats.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('events')
export class EventHeatsController {
  constructor(private readonly heatsService: EventHeatsService) {}

  @Get(':id/heats')
  async getHeats(@Param('id') id: string, @Query('round') round?: string) {
    const roundNumber = round ? parseInt(round, 10) : undefined;
    return this.heatsService.getHeats(id, roundNumber);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/generate-heats')
  async generateHeats(
    @Param('id') id: string,
    @Body('seedingRule') seedingRule?: string,
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.generateHeatsForCompetition(id, seedingRule, caller);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/heats/:heatNumber/start')
  async startHeat(
    @Param('id') id: string,
    @Param('heatNumber', ParseIntPipe) heatNumber: number,
    @Body('roundNumber') roundNumber?: number,
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.startHeat(id, heatNumber, roundNumber || 1, caller);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/heats/:heatNumber/dispute')
  async recordDispute(
    @Param('id') id: string,
    @Param('heatNumber', ParseIntPipe) heatNumber: number,
    @Body() body: { reason: string; roundNumber?: number },
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.recordHeatDispute(
      id,
      heatNumber,
      body.roundNumber || 1,
      body.reason || 'Telemetry discrepancy',
      caller,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/heats/:heatNumber/resolve-dispute')
  async resolveDispute(
    @Param('id') id: string,
    @Param('heatNumber', ParseIntPipe) heatNumber: number,
    @Body() body: { action: 'RERUN' | 'VALIDATE'; notes?: string; roundNumber?: number },
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.resolveHeatDispute(
      id,
      heatNumber,
      body.roundNumber || 1,
      body.action,
      caller,
      body.notes,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/heats/reassign')
  async reassignParticipant(
    @Param('id') id: string,
    @Body() body: { roundNumber: number; fromHeat: number; toHeat: number; userId: string },
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.reassignParticipant(
      id,
      body.roundNumber,
      body.fromHeat,
      body.toHeat,
      body.userId,
      caller,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/advance-round')
  async advanceRound(
    @Param('id') id: string,
    @Body() body: { currentRound: number; topPerHeat?: number },
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.advanceRound(
      id,
      body.currentRound || 1,
      body.topPerHeat || 2,
      caller,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/complete')
  async completeCompetition(
    @Param('id') id: string,
    @CurrentUser() caller?: any,
  ) {
    return this.heatsService.completeCompetition(id, caller);
  }

  @Get(':id/control-room')
  async getControlRoomStatus(@Param('id') id: string) {
    return this.heatsService.getLiveControlRoomStatus(id);
  }
}
