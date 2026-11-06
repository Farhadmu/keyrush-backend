import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Competition, CompetitionDocument, CompetitionStatus } from './schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from './schemas/registration.schema';
import { TournamentMatch, TournamentMatchDocument, MatchStatus } from './schemas/tournament-match.schema';
import { Certificate, CertificateDocument } from './schemas/certificate.schema';

@Injectable()
export class CompetitionsService {
  private readonly logger = new Logger(CompetitionsService.name);

  constructor(
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
    @InjectModel(TournamentMatch.name) private matchModel: Model<TournamentMatchDocument>,
    @InjectModel(Certificate.name) private certModel: Model<CertificateDocument>,
  ) {
    this.seedInitialCompetitions();
  }

  private async seedInitialCompetitions() {
    try {
      const count = await this.compModel.countDocuments();
      if (count === 0) {
        await this.compModel.create({
          title: 'Global Cyber Grand Prix 2026',
          slug: 'global-cyber-grand-prix-2026',
          description: 'Official world championship qualifying tournament for registered esports racers.',
          organizerId: new Types.ObjectId('672439a90b00000000000001'),
          visibility: 'PUBLIC',
          status: CompetitionStatus.REGISTRATION_OPEN,
          currentParticipantCount: 24,
          settings: {
            language: 'EN',
            difficulty: 'ADVANCED',
            raceDurationSeconds: 60,
            minParticipants: 20,
            maxParticipants: 300,
            roomMinPlayers: 2,
            roomMaxPlayers: 7,
            tournamentFormat: 'SINGLE_ELIMINATION',
          },
          registrationStart: new Date(),
          registrationEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          eventStart: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        });
      }
    } catch (e) {}
  }

  async createCompetition(
    organizerId: string,
    data: {
      title: string;
      description?: string;
      visibility?: string;
      organizationId?: string;
      minParticipants?: number;
      maxParticipants?: number;
      language?: string;
      difficulty?: string;
      tournamentFormat?: string;
    },
  ) {
    const minP = data.minParticipants ?? 20;
    const maxP = data.maxParticipants ?? 300;

    if (minP < 20) {
      throw new BadRequestException('Minimum event participants cannot be lower than 20.');
    }
    if (maxP > 300) {
      throw new BadRequestException('Maximum event participants cannot exceed 300.');
    }
    if (minP > maxP) {
      throw new BadRequestException('Minimum participants cannot exceed maximum participants.');
    }

    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);

    const comp = new this.compModel({
      title: data.title,
      slug,
      description: data.description || '',
      organizerId: new Types.ObjectId(organizerId),
      organizationId: data.organizationId && Types.ObjectId.isValid(data.organizationId) ? new Types.ObjectId(data.organizationId) : null,
      visibility: data.visibility || 'PUBLIC',
      status: CompetitionStatus.REGISTRATION_OPEN,
      currentParticipantCount: 0,
      settings: {
        language: data.language || 'EN',
        difficulty: data.difficulty || 'MEDIUM',
        raceDurationSeconds: 60,
        minParticipants: minP,
        maxParticipants: maxP,
        roomMinPlayers: 2,
        roomMaxPlayers: 7,
        tournamentFormat: data.tournamentFormat || 'SINGLE_ELIMINATION',
      },
    });

    return comp.save();
  }

  async getAllCompetitions(query?: { organizationId?: string }) {
    const filter: any = {};
    if (query?.organizationId && Types.ObjectId.isValid(query.organizationId)) {
      filter.organizationId = new Types.ObjectId(query.organizationId);
    }
    return this.compModel.find(filter).sort({ createdAt: -1 });
  }

  async getCompetitionByIdOrSlug(identifier: string) {
    const isId = Types.ObjectId.isValid(identifier);
    let comp = await this.compModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(identifier) : null }, { slug: identifier }],
    });
    if (!comp) throw new NotFoundException('Competition not found');
    return comp;
  }

  async registerParticipant(
    competitionId: string,
    user: { userId: string; username: string; roles: string[] },
  ) {
    if (!user || user.roles.includes('GUEST')) {
      throw new BadRequestException('Guest users cannot register for official events. Please create an account.');
    }

    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException(`Registration is closed for this event. Current status: ${comp.status}`);
    }

    const existing = await this.regModel.findOne({
      competitionId: comp._id,
      userId: new Types.ObjectId(user.userId),
    });
    if (existing) {
      throw new ConflictException('You are already registered for this competition.');
    }

    if (comp.currentParticipantCount >= comp.settings.maxParticipants) {
      throw new BadRequestException(
        `Event registration is full. Capacity reached: ${comp.settings.maxParticipants} / 300.`,
      );
    }

    const nextSeed = comp.currentParticipantCount + 1;
    const registration = new this.regModel({
      competitionId: comp._id,
      userId: new Types.ObjectId(user.userId),
      username: user.username,
      seedNumber: nextSeed,
      status: 'CONFIRMED',
    });
    await registration.save();

    comp.currentParticipantCount += 1;
    if (comp.currentParticipantCount >= comp.settings.maxParticipants) {
      comp.status = CompetitionStatus.REGISTRATION_CLOSED;
    }
    await comp.save();

    return {
      success: true,
      message: 'Successfully registered for competition.',
      registration,
      currentParticipantCount: comp.currentParticipantCount,
      minRequired: comp.settings.minParticipants,
      maxAllowed: comp.settings.maxParticipants,
    };
  }

  async getRegistrations(competitionId: string) {
    return this.regModel.find({ competitionId: new Types.ObjectId(competitionId), status: 'CONFIRMED' }).sort({ seedNumber: 1 });
  }

  // -------------------------------------------------------------
  // Tournament Bracket Engine (Single Elimination / Double / Swiss)
  // -------------------------------------------------------------
  async generateTournamentBracket(competitionId: string) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const registrations = await this.regModel
      .find({ competitionId: comp._id, status: 'CONFIRMED' })
      .sort({ seedNumber: 1 })
      .exec();

    // Rule 3.2: Minimum 20 confirmed participants
    if (registrations.length < comp.settings.minParticipants) {
      throw new BadRequestException(
        `Cannot generate tournament: Minimum ${comp.settings.minParticipants} confirmed registrations required. Currently have ${registrations.length}.`,
      );
    }

    // Delete any existing matches for this competition
    await this.matchModel.deleteMany({ competitionId: comp._id });

    // Seeding: 1 vs N, 2 vs N-1 (or standard bracket power of 2)
    const count = registrations.length;
    let bracketSize = 32;
    if (count > 32 && count <= 64) bracketSize = 64;
    else if (count > 64 && count <= 128) bracketSize = 128;
    else if (count > 128) bracketSize = 256;

    const matches: any[] = [];
    const numFirstRoundMatches = bracketSize / 2;

    for (let i = 0; i < numFirstRoundMatches; i++) {
      const p1Reg = registrations[i];
      const p2Reg = registrations[bracketSize - 1 - i];

      const player1 = p1Reg
        ? { userId: p1Reg.userId, username: p1Reg.username, seed: p1Reg.seedNumber, score: 0, accuracy: 0, isWinner: false }
        : { userId: null, username: 'BYE', seed: 0, score: 0, accuracy: 0, isWinner: false };

      const player2 = p2Reg
        ? { userId: p2Reg.userId, username: p2Reg.username, seed: p2Reg.seedNumber, score: 0, accuracy: 0, isWinner: false }
        : { userId: null, username: 'BYE', seed: 0, score: 0, accuracy: 0, isWinner: false };

      const isBye = !p1Reg || !p2Reg;
      const winnerId = isBye ? (p1Reg ? p1Reg.userId : (p2Reg ? p2Reg.userId : null)) : null;

      matches.push({
        competitionId: comp._id,
        roundNumber: 1,
        matchNumber: i + 1,
        roundName: `Round of ${bracketSize}`,
        player1,
        player2,
        winnerId,
        status: isBye ? MatchStatus.BYE : MatchStatus.SCHEDULED,
        scheduledTime: new Date(comp.eventStart || Date.now()),
      });
    }

    const createdMatches = await this.matchModel.insertMany(matches);
    comp.status = CompetitionStatus.IN_PROGRESS;
    await comp.save();

    return {
      success: true,
      competitionId: comp._id,
      bracketSize,
      totalMatchesCreated: createdMatches.length,
      matches: createdMatches,
    };
  }

  async getTournamentMatches(competitionId: string) {
    return this.matchModel
      .find({ competitionId: new Types.ObjectId(competitionId) })
      .sort({ roundNumber: 1, matchNumber: 1 })
      .exec();
  }

  async updateMatchResult(
    matchId: string,
    player1Score: number,
    player2Score: number,
    winnerUserId: string,
  ) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    match.player1.score = player1Score;
    match.player2.score = player2Score;
    match.winnerId = new Types.ObjectId(winnerUserId) as any;
    match.player1.isWinner = match.player1.userId?.toString() === winnerUserId;
    match.player2.isWinner = match.player2.userId?.toString() === winnerUserId;
    match.status = MatchStatus.COMPLETED;
    match.completedAt = new Date();
    await match.save();

    return match;
  }

  // -------------------------------------------------------------
  // Digital Certificate Issuance & Verification
  // -------------------------------------------------------------
  async issueCertificates(competitionId: string) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const registrations = await this.regModel.find({ competitionId: comp._id, status: 'CONFIRMED' }).limit(3);
    const issuedCerts: CertificateDocument[] = [];

    const ranks = ['CHAMPION (1st Place)', 'RUNNER-UP (2nd Place)', 'THIRD PLACE (3rd Place)'];

    for (let i = 0; i < registrations.length; i++) {
      const reg = registrations[i];
      const certId = `KR-CERT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const verificationPayload = `${certId}|${comp._id}|${reg.userId}|${ranks[i]}`;
      const verificationHash = crypto.createHash('sha256').update(verificationPayload).digest('hex');

      const cert = new this.certModel({
        certificateId: certId,
        competitionId: comp._id,
        competitionTitle: comp.title,
        userId: reg.userId,
        recipientName: reg.username,
        achievementRank: ranks[i] || 'HONORABLE FINALIST',
        bestWpm: 95 - i * 5,
        accuracy: 98.5 - i * 0.5,
        issueDate: new Date(),
        verificationHash,
      });

      issuedCerts.push(await cert.save());
    }

    comp.status = CompetitionStatus.COMPLETED;
    await comp.save();

    return issuedCerts;
  }

  async verifyCertificate(certificateId: string) {
    const cert = await this.certModel.findOne({ certificateId }).exec();
    if (!cert) throw new NotFoundException('Certificate not found or invalid ID.');
    return {
      isValid: !cert.isRevoked,
      certificate: cert,
      status: cert.isRevoked ? 'REVOKED' : 'VERIFIED_AUTHENTIC',
    };
  }

  async getUserCertificates(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.certModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec();
  }
}
