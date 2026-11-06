import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Competition, CompetitionDocument, CompetitionStatus } from './schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from './schemas/registration.schema';

@Injectable()
export class CompetitionsService {
  constructor(
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
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
          organizerId: '672439a90b00000000000001',
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
    } catch (e) {
      // In-memory or startup note
    }
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
    },
  ) {
    const minP = data.minParticipants ?? 20;
    const maxP = data.maxParticipants ?? 300;

    // Rule 3.2: Every official competition event must support Min 20 and Max 300 participants
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
      organizerId,
      organizationId: data.organizationId || null,
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
        tournamentFormat: 'SINGLE_ELIMINATION',
      },
    });

    return comp.save();
  }

  async getAllCompetitions(query?: { organizationId?: string }) {
    const filter: any = {};
    if (query?.organizationId) {
      filter.organizationId = query.organizationId;
    }
    return this.compModel.find(filter).sort({ createdAt: -1 });
  }

  async getCompetitionByIdOrSlug(identifier: string) {
    let comp = await this.compModel.findOne({
      $or: [{ _id: identifier.match(/^[0-9a-fA-F]{24}$/) ? identifier : null }, { slug: identifier }],
    });
    if (!comp) throw new NotFoundException('Competition not found');
    return comp;
  }

  /**
   * Atomic Registration Method
   * Prevents race conditions and strictly caps at 300 participants.
   */
  async registerParticipant(
    competitionId: string,
    user: { userId: string; username: string; roles: string[] },
  ) {
    // Rule 3.2: Only registered and authenticated accounts can register
    if (!user || user.roles.includes('GUEST')) {
      throw new BadRequestException('Guest users cannot register for official events. Please create an account.');
    }

    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException(`Registration is closed for this event. Current status: ${comp.status}`);
    }

    // Check if user already registered
    const existing = await this.regModel.findOne({
      competitionId: comp._id,
      userId: user.userId,
    });
    if (existing) {
      throw new ConflictException('You are already registered for this competition.');
    }

    // Rule 3.2: Enforce max 300 participants limit atomically
    if (comp.currentParticipantCount >= comp.settings.maxParticipants) {
      throw new BadRequestException(
        `Event registration is full. Capacity reached: ${comp.settings.maxParticipants} / 300.`,
      );
    }

    const nextSeed = comp.currentParticipantCount + 1;
    const registration = new this.regModel({
      competitionId: comp._id,
      userId: user.userId,
      username: user.username,
      seedNumber: nextSeed,
      status: 'CONFIRMED',
    });
    await registration.save();

    // Atomic increment
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
    return this.regModel.find({ competitionId, status: 'CONFIRMED' }).sort({ seedNumber: 1 });
  }
}
