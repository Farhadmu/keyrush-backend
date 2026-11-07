import { Injectable, BadRequestException, NotFoundException, ForbiddenException, Optional, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventHeat, EventHeatDocument } from './schemas/heat.schema';
import { Competition, CompetitionDocument, CompetitionStatus } from '../competitions/schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from '../competitions/schemas/registration.schema';
import { RoomManager } from '../multiplayer/room.manager';
import { TypingService } from '../typing/typing.service';

export interface ParticipantSeedInfo {
  userId: string;
  username: string;
  seedNumber: number;
  institution?: string;
  carId?: string;
}

export interface PartitionedHeatResult {
  heatNumber: number;
  participantCount: number;
  roomId?: string;
  participants: Array<{
    userId: string;
    username: string;
    seedNumber: number;
    institution?: string;
    carId?: string;
  }>;
}

@Injectable()
export class EventHeatsService {
  private readonly logger = new Logger(EventHeatsService.name);

  constructor(
    @InjectModel(EventHeat.name) private heatModel: Model<EventHeatDocument>,
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
    @Optional() private readonly roomManager?: RoomManager,
    @Optional() private readonly typingService?: TypingService,
  ) {}

  private checkOrganizerOrAdmin(comp: CompetitionDocument, caller?: any) {
    if (!caller) return; // internal/scheduler call
    const isOrganizer =
      caller.userId && comp.organizerId && comp.organizerId.toString() === caller.userId.toString();
    const isSuperAdmin = (caller.roles || []).includes('SUPER_ADMIN');
    if (!isOrganizer && !isSuperAdmin) {
      throw new ForbiddenException('Only the designated event organizer or a SUPER_ADMIN can manage tournament heats.');
    }
  }

  /**
   * Balanced Heat Partitioning Algorithm
   * Strictly enforces:
   * 1. Total participants N must satisfy 20 <= N <= 300 for Round 1 (or >= 2 for advanced rounds).
   * 2. Every heat MUST contain between 2 and 7 players (2 <= |Heat| <= 7).
   * 3. An event NEVER places all racers in a single room.
   */
  partitionParticipants(
    participants: ParticipantSeedInfo[],
    isInitialRound: boolean = true,
  ): PartitionedHeatResult[] {
    const n = participants.length;

    // Rule 3.2: Minimum 20 participants required to generate official Round 1 heats
    if (isInitialRound && n < 20) {
      throw new BadRequestException(
        `Cannot generate heats: Minimum 20 confirmed participants required. Current: ${n}. Organizer must be notified.`,
      );
    }

    if (n < 2) {
      throw new BadRequestException(`Cannot partition fewer than 2 participants. Current: ${n}.`);
    }

    // Rule 3.2: Maximum 300 participants
    if (n > 300) {
      throw new BadRequestException(
        `Cannot generate heats: Participant count (${n}) exceeds platform maximum limit of 300.`,
      );
    }

    // Target heat size: between 2 and 7 racers
    const numHeats = Math.ceil(n / 7);
    const baseSize = Math.floor(n / numHeats);
    const remainder = n % numHeats;

    const heats: PartitionedHeatResult[] = [];
    let currentIndex = 0;

    for (let h = 0; h < numHeats; h++) {
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

  /**
   * Seeding Algorithms
   */
  applySeeding(participants: ParticipantSeedInfo[], rule: string = 'RANDOM'): ParticipantSeedInfo[] {
    const list = [...participants];

    if (rule === 'RANDOM') {
      // Fisher-Yates shuffle
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
      return list;
    }

    if (rule === 'RANKED_ELO') {
      // Sort by seedNumber ascending (Seed 1 is top)
      list.sort((a, b) => a.seedNumber - b.seedNumber);
      const numHeats = Math.ceil(list.length / 7);
      const heatBuckets: ParticipantSeedInfo[][] = Array.from({ length: numHeats }, () => []);

      // Snake draft distribution: Heat 1 -> H_max -> H_max -> Heat 1
      let heatIndex = 0;
      let ascending = true;

      for (const p of list) {
        heatBuckets[heatIndex].push(p);
        if (ascending) {
          if (heatIndex === numHeats - 1) {
            ascending = false;
          } else {
            heatIndex++;
          }
        } else {
          if (heatIndex === 0) {
            ascending = true;
          } else {
            heatIndex--;
          }
        }
      }

      // Flatten back
      const flattened: ParticipantSeedInfo[] = [];
      for (const bucket of heatBuckets) {
        flattened.push(...bucket);
      }
      return flattened;
    }

    if (rule === 'INSTITUTION_BALANCED') {
      // Group participants by institution name
      const groups = new Map<string, ParticipantSeedInfo[]>();
      for (const p of list) {
        const inst = (p.institution || 'INDIVIDUAL').trim().toUpperCase();
        if (!groups.has(inst)) groups.set(inst, []);
        groups.get(inst)!.push(p);
      }

      // Distribute institution peers across different heats round-robin
      const sortedInstitutions = Array.from(groups.values()).sort((a, b) => b.length - a.length);
      const numHeats = Math.ceil(list.length / 7);
      const heatBuckets: ParticipantSeedInfo[][] = Array.from({ length: numHeats }, () => []);

      let heatPointer = 0;
      for (const instGroup of sortedInstitutions) {
        for (const racer of instGroup) {
          heatBuckets[heatPointer].push(racer);
          heatPointer = (heatPointer + 1) % numHeats;
        }
      }

      const flattened: ParticipantSeedInfo[] = [];
      for (const bucket of heatBuckets) {
        flattened.push(...bucket);
      }
      return flattened;
    }

    return list;
  }

  /**
   * Generate Round 1 Heats with Seeding and Provision Multiplayer Rooms
   */
  async generateHeatsForCompetition(competitionId: string, seedingRule?: string, caller?: any) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const registrations = await this.regModel.find({
      competitionId: comp._id,
      status: 'CONFIRMED',
    });

    if (registrations.length < (comp.settings?.minParticipants || 20)) {
      throw new BadRequestException(
        `Cannot generate heats: Minimum ${comp.settings?.minParticipants || 20} confirmed participants required. Current: ${registrations.length}.`,
      );
    }

    const participantList: ParticipantSeedInfo[] = registrations.map((r, i) => ({
      userId: r.userId.toString(),
      username: r.username,
      seedNumber: r.seedNumber || i + 1,
      institution: r.institutionName || '',
      carId: 'car_cyber_phantom',
    }));

    const rule = seedingRule || comp.settings?.seedingRule || 'RANDOM';
    const seededList = this.applySeeding(participantList, rule);
    const partitionedHeats = this.partitionParticipants(seededList, true);

    // Clean up any unstarted round 1 heats
    await this.heatModel.deleteMany({ competitionId: comp._id, roundNumber: 1 });

    const slug = comp.slug || comp._id.toString();
    const heatDocuments = [];

    for (const h of partitionedHeats) {
      const roomId = `ROOM-EVENT-${slug}-R1-H${h.heatNumber}`;
      h.roomId = roomId;

      // Provision room in RoomManager
      if (this.roomManager) {
        await this.roomManager.createOrProvisionHeatRoom(roomId, {
          name: `${comp.title} - Round 1 Heat ${h.heatNumber}`,
          maxPlayers: h.participantCount,
          language: comp.settings?.language || 'EN',
          allowedUserIds: h.participants.map(p => p.userId.toString()),
        });
      }

      heatDocuments.push({
        competitionId: comp._id,
        roundNumber: 1,
        heatNumber: h.heatNumber,
        roomId,
        status: 'READY',
        scheduledStartTime: comp.eventStart || new Date(),
        participants: h.participants.map(p => ({
          userId: Types.ObjectId.isValid(p.userId) ? (new Types.ObjectId(p.userId) as any) : (p.userId as any),
          username: p.username,
          carId: p.carId || 'car_cyber_phantom',
          finishPosition: 0,
          netWpm: 0,
          accuracy: 0,
          qualified: false,
        })),
      });

      // Update registration record with assignedHeat
      for (const p of h.participants) {
        await this.regModel.updateOne(
          {
            competitionId: comp._id,
            userId: Types.ObjectId.isValid(p.userId) ? new Types.ObjectId(p.userId) : (p.userId as any),
          },
          { $set: { assignedHeat: h.heatNumber, assignedGroup: `Group-${h.heatNumber}` } },
        );
      }
    }

    await this.heatModel.insertMany(heatDocuments);

    comp.status = CompetitionStatus.HEATS_GENERATED;
    if (comp.settings) {
      comp.settings.seedingRule = rule as any;
    }
    await comp.save();

    return {
      success: true,
      competitionId: comp._id,
      seedingRule: rule,
      totalParticipants: participantList.length,
      totalHeats: partitionedHeats.length,
      minHeatSize: Math.min(...partitionedHeats.map(h => h.participantCount)),
      maxHeatSize: Math.max(...partitionedHeats.map(h => h.participantCount)),
      heats: partitionedHeats,
    };
  }

  async getHeats(competitionId: string, roundNumber?: number) {
    const filter: any = {
      competitionId: Types.ObjectId.isValid(competitionId) ? new Types.ObjectId(competitionId) : competitionId,
    };
    if (roundNumber) {
      filter.roundNumber = roundNumber;
    }
    return this.heatModel.find(filter).sort({ roundNumber: 1, heatNumber: 1 }).exec();
  }

  /**
   * Start a Heat Race
   */
  async startHeat(competitionId: string, heatNumber: number, roundNumber: number = 1, caller?: any) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const heat = await this.heatModel.findOne({
      competitionId: comp._id,
      roundNumber,
      heatNumber,
    });
    if (!heat) throw new NotFoundException(`Heat ${heatNumber} in Round ${roundNumber} not found.`);

    if (heat.status === 'COMPLETED') {
      throw new BadRequestException('Heat has already concluded.');
    }

    // Ensure room is provisioned
    const roomId = heat.roomId || `ROOM-EVENT-${comp.slug || comp._id}-R${roundNumber}-H${heatNumber}`;
    if (this.roomManager) {
      await this.roomManager.createOrProvisionHeatRoom(roomId, {
        name: `${comp.title} - Round ${roundNumber} Heat ${heatNumber}`,
        maxPlayers: heat.participants.length,
        language: comp.settings?.language || 'EN',
        allowedUserIds: heat.participants.map(p => p.userId.toString()),
      });
    }

    heat.roomId = roomId;
    heat.status = 'RACING';
    heat.actualStartTime = new Date();
    await heat.save();

    if (comp.status !== CompetitionStatus.IN_PROGRESS) {
      comp.status = CompetitionStatus.IN_PROGRESS;
      await comp.save();
    }

    return {
      success: true,
      heatNumber,
      roundNumber,
      roomId,
      status: heat.status,
      participants: heat.participants,
    };
  }

  /**
   * Record a Heat Dispute
   */
  async recordHeatDispute(
    competitionId: string,
    heatNumber: number,
    roundNumber: number = 1,
    reason: string,
    caller: any,
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const heat = await this.heatModel.findOne({
      competitionId: comp._id,
      roundNumber,
      heatNumber,
    });
    if (!heat) throw new NotFoundException('Heat not found');

    heat.status = 'DISPUTED';
    heat.disputeState = {
      hasDispute: true,
      reason,
      resolvedBy: '',
      resolvedAt: null,
    };
    await heat.save();

    return {
      success: true,
      message: `Dispute logged for Heat ${heatNumber}.`,
      heat,
    };
  }

  /**
   * Resolve a Heat Dispute: RERUN or VALIDATE
   */
  async resolveHeatDispute(
    competitionId: string,
    heatNumber: number,
    roundNumber: number = 1,
    action: 'RERUN' | 'VALIDATE',
    caller: any,
    notes?: string,
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const heat = await this.heatModel.findOne({
      competitionId: comp._id,
      roundNumber,
      heatNumber,
    });
    if (!heat) throw new NotFoundException('Heat not found');

    if (action === 'RERUN') {
      heat.status = 'READY';
      heat.actualStartTime = null as any;
      heat.completedAt = null as any;
      for (const p of heat.participants) {
        p.finishPosition = 0;
        p.netWpm = 0;
        p.accuracy = 0;
        p.qualified = false;
      }
      heat.disputeState = {
        hasDispute: false,
        reason: heat.disputeState?.reason || '',
        resolvedBy: caller.userId,
        resolvedAt: new Date(),
      };
      heat.organizerNotes = (heat.organizerNotes ? heat.organizerNotes + '\n' : '') + `[DISPUTE RESOLVED: RERUN] ${notes || ''}`;
    } else {
      heat.status = 'COMPLETED';
      heat.disputeState = {
        hasDispute: false,
        reason: heat.disputeState?.reason || '',
        resolvedBy: caller.userId,
        resolvedAt: new Date(),
      };
      heat.organizerNotes = (heat.organizerNotes ? heat.organizerNotes + '\n' : '') + `[DISPUTE RESOLVED: VALIDATED] ${notes || ''}`;
    }

    await heat.save();

    return {
      success: true,
      action,
      heat,
    };
  }

  /**
   * Reassign Participant Between Heats (strictly enforces 2 <= |Heat| <= 7)
   */
  async reassignParticipant(
    competitionId: string,
    roundNumber: number,
    fromHeatNum: number,
    toHeatNum: number,
    userId: string,
    caller: any,
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const fromHeat = await this.heatModel.findOne({ competitionId: comp._id, roundNumber, heatNumber: fromHeatNum });
    const toHeat = await this.heatModel.findOne({ competitionId: comp._id, roundNumber, heatNumber: toHeatNum });

    if (!fromHeat || !toHeat) {
      throw new NotFoundException('Source or destination heat not found.');
    }

    if (fromHeat.status === 'RACING' || fromHeat.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot reassign from heat ${fromHeatNum}: already ${fromHeat.status}.`);
    }

    if (toHeat.status === 'RACING' || toHeat.status === 'COMPLETED') {
      throw new BadRequestException(`Cannot reassign to heat ${toHeatNum}: already ${toHeat.status}.`);
    }

    // Boundary check: Source heat cannot drop below 2
    if (fromHeat.participants.length - 1 < 2) {
      throw new BadRequestException(`Cannot move participant: Source heat ${fromHeatNum} would drop below minimum 2 racers.`);
    }

    // Boundary check: Destination heat cannot exceed 7
    if (toHeat.participants.length + 1 > 7) {
      throw new BadRequestException(`Cannot move participant: Destination heat ${toHeatNum} would exceed maximum 7 racers.`);
    }

    const participantIdx = fromHeat.participants.findIndex(p => p.userId.toString() === userId);
    if (participantIdx === -1) {
      throw new NotFoundException(`Participant not found in heat ${fromHeatNum}.`);
    }

    const [participant] = fromHeat.participants.splice(participantIdx, 1);
    toHeat.participants.push(participant);

    await fromHeat.save();
    await toHeat.save();

    // Synchronize allowed participants in multiplayer rooms
    if (this.roomManager) {
      if (fromHeat.roomId) {
        this.roomManager.setAllowedUserIds(
          fromHeat.roomId,
          fromHeat.participants.map(p => p.userId.toString()),
        );
      }
      if (toHeat.roomId) {
        this.roomManager.setAllowedUserIds(
          toHeat.roomId,
          toHeat.participants.map(p => p.userId.toString()),
        );
      }
    }

    // Update registration record
    await this.regModel.updateOne(
      { competitionId: comp._id, userId: new Types.ObjectId(userId) },
      { $set: { assignedHeat: toHeatNum, assignedGroup: `Group-${toHeatNum}` } },
    );

    return {
      success: true,
      message: `Participant ${participant.username} moved from Heat ${fromHeatNum} to Heat ${toHeatNum}.`,
      fromHeatCount: fromHeat.participants.length,
      toHeatCount: toHeat.participants.length,
    };
  }

  /**
   * Advance Tournament to Next Round or Grand Final
   */
  async advanceRound(competitionId: string, currentRoundNumber: number, topPerHeat: number = 2, caller?: any) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    const currentHeats = await this.heatModel.find({
      competitionId: comp._id,
      roundNumber: currentRoundNumber,
    });

    if (currentHeats.length === 0) {
      throw new BadRequestException(`No heats found for Round ${currentRoundNumber}.`);
    }

    const incomplete = currentHeats.filter(h => h.status !== 'COMPLETED');
    if (incomplete.length > 0) {
      throw new BadRequestException(
        `Cannot advance round: All heats in Round ${currentRoundNumber} must be COMPLETED. ${incomplete.length} heat(s) remaining.`,
      );
    }

    // Extract top qualifiers from each heat
    const qualifiers: ParticipantSeedInfo[] = [];

    for (const heat of currentHeats) {
      const sortedParticipants = [...heat.participants].sort((a, b) => {
        if (a.finishPosition > 0 && b.finishPosition > 0) return a.finishPosition - b.finishPosition;
        return b.netWpm - a.netWpm;
      });

      const topRanked = sortedParticipants.slice(0, topPerHeat);
      for (const p of topRanked) {
        // Mark qualified on heat document
        const original = heat.participants.find(part => part.userId.toString() === p.userId.toString());
        if (original) original.qualified = true;

        qualifiers.push({
          userId: p.userId.toString(),
          username: p.username,
          seedNumber: p.finishPosition || 1,
          carId: p.carId,
        });
      }
      await heat.save();
    }

    const qCount = qualifiers.length;
    if (qCount < 2) {
      throw new BadRequestException(`Insufficient qualifiers to create next round (${qCount} < 2).`);
    }

    const nextRoundNumber = currentRoundNumber + 1;
    await this.heatModel.deleteMany({ competitionId: comp._id, roundNumber: nextRoundNumber });

    const slug = comp.slug || comp._id.toString();

    // If qualifiers fit in a single room (<= 7), create the GRAND FINAL!
    if (qCount <= 7) {
      const roomId = `ROOM-EVENT-${slug}-R${nextRoundNumber}-FINAL`;

      if (this.roomManager) {
        await this.roomManager.createOrProvisionHeatRoom(roomId, {
          name: `${comp.title} - Grand Final (Round ${nextRoundNumber})`,
          maxPlayers: qCount,
          language: comp.settings?.language || 'EN',
          allowedUserIds: qualifiers.map(q => q.userId.toString()),
        });
      }

      const grandFinal = new this.heatModel({
        competitionId: comp._id,
        roundNumber: nextRoundNumber,
        heatNumber: 1,
        roomId,
        status: 'READY',
        scheduledStartTime: new Date(Date.now() + 5 * 60 * 1000), // 5 min break
        participants: qualifiers.map(q => ({
          userId: Types.ObjectId.isValid(q.userId) ? (new Types.ObjectId(q.userId) as any) : (q.userId as any),
          username: q.username,
          carId: q.carId || 'car_cyber_phantom',
          finishPosition: 0,
          netWpm: 0,
          accuracy: 0,
          qualified: false,
        })),
        organizerNotes: `Grand Final created with top ${topPerHeat} qualifiers from Round ${currentRoundNumber}.`,
      });

      await grandFinal.save();

      return {
        success: true,
        isGrandFinal: true,
        currentRound: currentRoundNumber,
        nextRound: nextRoundNumber,
        totalQualifiers: qCount,
        heatsCount: 1,
        heats: [grandFinal],
      };
    }

    // More than 7 qualifiers: Partition into next round heats (e.g. Semifinals)
    const partitionedNextHeats = this.partitionParticipants(qualifiers, false);
    const newHeatDocs = [];

    for (const h of partitionedNextHeats) {
      const roomId = `ROOM-EVENT-${slug}-R${nextRoundNumber}-H${h.heatNumber}`;
      h.roomId = roomId;

      if (this.roomManager) {
        await this.roomManager.createOrProvisionHeatRoom(roomId, {
          name: `${comp.title} - Round ${nextRoundNumber} Heat ${h.heatNumber}`,
          maxPlayers: h.participantCount,
          language: comp.settings?.language || 'EN',
          allowedUserIds: h.participants.map(p => p.userId.toString()),
        });
      }

      newHeatDocs.push({
        competitionId: comp._id,
        roundNumber: nextRoundNumber,
        heatNumber: h.heatNumber,
        roomId,
        status: 'READY',
        scheduledStartTime: new Date(Date.now() + 5 * 60 * 1000),
        participants: h.participants.map(p => ({
          userId: Types.ObjectId.isValid(p.userId) ? (new Types.ObjectId(p.userId) as any) : (p.userId as any),
          username: p.username,
          carId: p.carId || 'car_cyber_phantom',
          finishPosition: 0,
          netWpm: 0,
          accuracy: 0,
          qualified: false,
        })),
      });
    }

    await this.heatModel.insertMany(newHeatDocs);

    return {
      success: true,
      isGrandFinal: false,
      currentRound: currentRoundNumber,
      nextRound: nextRoundNumber,
      totalQualifiers: qCount,
      heatsCount: partitionedNextHeats.length,
      heats: partitionedNextHeats,
    };
  }

  /**
   * Complete Competition & Crown Champion
   */
  async completeCompetition(competitionId: string, caller?: any) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    this.checkOrganizerOrAdmin(comp, caller);

    // Find the highest round heats
    const allHeats = await this.heatModel.find({ competitionId: comp._id }).sort({ roundNumber: -1, heatNumber: 1 });
    if (allHeats.length === 0) {
      throw new BadRequestException('No heats recorded for this competition.');
    }

    const maxRound = allHeats[0].roundNumber;
    const finalHeats = allHeats.filter(h => h.roundNumber === maxRound);

    const allFinalParticipants = finalHeats.flatMap(h => h.participants);
    const sortedPodium = allFinalParticipants.sort((a, b) => {
      if (a.finishPosition > 0 && b.finishPosition > 0) return a.finishPosition - b.finishPosition;
      return b.netWpm - a.netWpm;
    });

    const champion = sortedPodium[0];
    const runnerUp = sortedPodium[1];
    const thirdPlace = sortedPodium[2];

    comp.status = CompetitionStatus.COMPLETED;
    if (champion?.userId) {
      comp.winnerUserId = champion.userId as any;
    }
    await comp.save();

    return {
      success: true,
      competitionStatus: comp.status,
      winner: champion ? { userId: champion.userId, username: champion.username, netWpm: champion.netWpm } : null,
      podium: {
        champion: champion ? { username: champion.username, netWpm: champion.netWpm } : null,
        runnerUp: runnerUp ? { username: runnerUp.username, netWpm: runnerUp.netWpm } : null,
        thirdPlace: thirdPlace ? { username: thirdPlace.username, netWpm: thirdPlace.netWpm } : null,
      },
    };
  }

  /**
   * Live Control Room Aggregated Status
   */
  async getLiveControlRoomStatus(competitionId: string) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const allHeats = await this.heatModel.find({ competitionId: comp._id }).sort({ roundNumber: 1, heatNumber: 1 }).exec();
    const activeRound = allHeats.length > 0 ? Math.max(...allHeats.map(h => h.roundNumber)) : 1;

    const roundHeats = allHeats.filter(h => h.roundNumber === activeRound);
    const completedHeats = roundHeats.filter(h => h.status === 'COMPLETED').length;
    const racingHeats = roundHeats.filter(h => h.status === 'RACING').length;
    const disputedHeats = roundHeats.filter(h => h.status === 'DISPUTED' || h.disputeState?.hasDispute).length;

    // Leaderboard across all heats so far
    const allParticipantsWithScores = allHeats
      .flatMap(h => h.participants)
      .filter(p => p.netWpm > 0)
      .sort((a, b) => b.netWpm - a.netWpm)
      .slice(0, 10)
      .map((p, idx) => ({
        rank: idx + 1,
        username: p.username,
        userId: p.userId,
        netWpm: p.netWpm,
        accuracy: p.accuracy,
      }));

    return {
      competition: {
        id: comp._id,
        title: comp.title,
        slug: comp.slug,
        status: comp.status,
        eventStart: comp.eventStart,
        minParticipants: comp.settings?.minParticipants || 20,
        maxParticipants: comp.settings?.maxParticipants || 300,
      },
      currentRound: activeRound,
      totalHeatsInRound: roundHeats.length,
      completedHeats,
      racingHeats,
      disputedHeats,
      canAdvanceRound: roundHeats.length > 0 && completedHeats === roundHeats.length,
      heats: roundHeats,
      allRounds: Array.from(new Set(allHeats.map(h => h.roundNumber))),
      topRacers: allParticipantsWithScores,
    };
  }
}
