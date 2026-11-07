import {
  Controller,
  Get,
  Post,
  Delete,
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

  @UseGuards(JwtAuthGuard)
  @Get(':id/registrations')
  getRegistrations(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('verificationStatus') verificationStatus?: string,
    @Query('checkInStatus') checkInStatus?: string,
    @Query('search') search?: string,
    @CurrentUser() user?: any,
  ) {
    return this.competitionsService.getRegistrations(
      id,
      {
        status,
        verificationStatus,
        checkInStatus,
        search,
      },
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/registrations/export-csv')
  async exportRegistrationsCsv(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    const csvData = await this.competitionsService.exportRegistrationsCsv(id, user);
    return {
      success: true,
      csv: csvData,
      filename: `keyrush-tournament-${id}-roster.csv`,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/my-registration')
  getMyRegistration(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
  ) {
    return this.competitionsService.getMyRegistration(id, userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/check-in')
  checkIn(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.checkInParticipant(id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/registrations/:regId/verify')
  verifyStudent(
    @Param('id') id: string,
    @Param('regId') regId: string,
    @Body() body: { status: 'VERIFIED' | 'REJECTED'; notes?: string },
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.verifyStudentRegistration(id, regId, body.status, body.notes, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/schedule')
  updateSchedule(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.updateCompetitionSchedule(id, body, user);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body('status') status: any,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.updateCompetitionStatus(id, status, user);
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
    @Body() studentData: any,
  ) {
    return this.competitionsService.registerParticipant(id, user, studentData);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/register')
  cancelRegistration(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.cancelRegistration(id, user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/bracket/generate')
  generateBracket(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.generateTournamentBracket(id, user);
  }

  @Get(':id/bracket')
  getBracket(@Param('id') id: string) {
    return this.competitionsService.getTournamentMatches(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('matches/:matchId/score')
  updateMatchScore(
    @Param('matchId') matchId: string,
    @CurrentUser() user: any,
    @Body() body: { player1Score: number; player2Score: number; winnerUserId: string },
  ) {
    return this.competitionsService.updateMatchResult(
      matchId,
      body.player1Score,
      body.player2Score,
      body.winnerUserId,
      user,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/certificates/issue')
  issueCertificates(
    @Param('id') id: string,
    @CurrentUser() user: any,
  ) {
    return this.competitionsService.issueCertificates(id, user);
  }
}
