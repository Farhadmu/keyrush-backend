import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EventHeat, EventHeatDocument } from './schemas/heat.schema';
import { Competition, CompetitionDocument, CompetitionStatus } from '../competitions/schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from '../competitions/schemas/registration.schema';

export interface PartitionedHeatResult {
  heatNumber: number;
  participantCount: number;
  participants: Array<{
    userId: string;
    username: string;
    seedNumber: number;
  }>;
}

@Injectable()
export class EventHeatsService {
  constructor(
    @InjectModel(EventHeat.name) private heatModel: Model<EventHeatDocument>,
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
  ) {}

  /**
   * Balanced Heat Partitioning Algorithm
   * Strictly enforces:
   * 1. Total participants N must satisfy 20 <= N <= 300.
   * 2. Every heat MUST contain between 2 and 7 players (2 <= |Heat| <= 7).
   * 3. An event NEVER places all racers in a single room.
   */
  partitionParticipants(
    participants: Array<{ userId: string; username: string; seedNumber: number }>,
  ): PartitionedHeatResult[] {
    const n = participants.length;

    // Rule 3.2: Minimum 20 participants required to generate official heats
    if (n < 20) {
      throw new BadRequestException(
        `Cannot generate heats: Minimum 20 confirmed participants required. Current: ${n}. Organizer must be notified.`,
      );
    }

    // Rule 3.2: Maximum 300 participants
    if (n > 300) {
      throw new BadRequestException(
        `Cannot generate heats: Participant count (${n}) exceeds platform maximum limit of 300.`,
      );
    }

    // Calculate optimal number of heats (each heat having at most 7 players)
    // Target heat size: between 5 and 7 racers
    const numHeats = Math.ceil(n / 7);
    const baseSize = Math.floor(n / numHeats);
    const remainder = n % numHeats;

    const heats: PartitionedHeatResult[] = [];
    let currentIndex = 0;

    for (let h = 0; h < numHeats; h++) {
      // remainder heats get baseSize + 1, others get baseSize
      const heatSize = h < remainder ? baseSize + 1 : baseSize;

      // Mathematical boundary check: Heat must be >= 2 and <= 7
      if (heatSize < 2 || heatSize > 7) {
        throw new Error(`Fatal heat sizing error: calculated heat size ${heatSize} violates [2, 7] rule.`);
      }

      const heatParticipants = participants.slice(currentIndex, currentIndex + heatSize);
      currentIndex += heatSize;

      heats.push({
        heatNumber: h + 1,
        participantCount: heatSize,
        participants: heatParticipants,
      });
    }

    return heats;
  }

  async generateHeatsForCompetition(competitionId: string) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const registrations = await this.regModel.find({
      competitionId: comp._id,
      status: 'CONFIRMED',
    });

    const participantList = registrations.map((r, i) => ({
      userId: r.userId.toString(),
      username: r.username,
      seedNumber: r.seedNumber || i + 1,
    }));

    const partitionedHeats = this.partitionParticipants(participantList);

    // Persist heats to database
    await this.heatModel.deleteMany({ competitionId: comp._id, roundNumber: 1 });

    const heatDocuments = partitionedHeats.map(h => ({
      competitionId: comp._id,
      roundNumber: 1,
      heatNumber: h.heatNumber,
      status: 'READY',
      participants: h.participants.map(p => ({
        userId: p.userId,
        username: p.username,
        carId: 'car_cyber_phantom',
        finishPosition: 0,
        netWpm: 0,
        accuracy: 0,
        qualified: false,
      })),
    }));

    await this.heatModel.insertMany(heatDocuments);

    comp.status = CompetitionStatus.HEATS_GENERATED;
    await comp.save();

    return {
      success: true,
      competitionId: comp._id,
      totalParticipants: participantList.length,
      totalHeats: partitionedHeats.length,
      minHeatSize: Math.min(...partitionedHeats.map(h => h.participantCount)),
      maxHeatSize: Math.max(...partitionedHeats.map(h => h.participantCount)),
      heats: partitionedHeats,
    };
  }

  async getHeats(competitionId: string, roundNumber: number = 1) {
    return this.heatModel.find({ competitionId, roundNumber }).sort({ heatNumber: 1 });
  }
}
