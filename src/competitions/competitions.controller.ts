import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { CompetitionsService } from './competitions.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('competitions')
export class CompetitionsController {
  constructor(private readonly competitionsService: CompetitionsService) {}

  @Get()
  getAllCompetitions(@Query('organizationId') organizationId?: string) {
    return this.competitionsService.getAllCompetitions({ organizationId });
  }

  @Get('certificate/verify/:certificateId')
  verifyCertificate(@Param('certificateId') certificateId: string) {
    return this.competitionsService.verifyCertificate(certificateId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('certificates/my')
  getMyCertificates(@CurrentUser('userId') userId: string) {
    return this.competitionsService.getUserCertificates(userId);
  }

  @Get(':idOrSlug')
  getCompetition(@Param('idOrSlug') idOrSlug: string) {
    return this.competitionsService.getCompetitionByIdOrSlug(idOrSlug);
  }

  @Get(':id/registrations')
  getRegistrations(@Param('id') id: string) {
    return this.competitionsService.getRegistrations(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  createCompetition(
    @CurrentUser('userId') userId: string,
    @Body() body: any,
  ) {
    return this.competitionsService.createCompetition(userId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/register')
  registerParticipant(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.registerParticipant(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bracket/generate')
  generateBracket(@Param('id') id: string) {
    return this.competitionsService.generateTournamentBracket(id);
  }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string) {
    return this.competitionsService.getTournamentMatches(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('matches/:matchId/score')
  updateMatchScore(
    @Param('matchId') matchId: string,
    @Body() body: { player1Score: number; player2Score: number; winnerUserId: string },
  ) {
    return this.competitionsService.updateMatchResult(
      matchId,
      body.player1Score,
      body.player2Score,
      body.winnerUserId,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/certificates/issue')
  issueCertificates(@Param('id') id: string) {
    return this.competitionsService.issueCertificates(id);
  }
}
