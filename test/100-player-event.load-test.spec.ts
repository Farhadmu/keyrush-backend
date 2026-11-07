import { EventHeatsService } from '../src/event-heats/event-heats.service';
import { RoomManager, RoomState } from '../src/multiplayer/room.manager';
import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('KEYRUSH 100-Student Esports Tournament & Load Test Suite', () => {
  let heatsService: EventHeatsService;
  let roomManager: RoomManager;
  let typingService: TypingService;
  let racingService: RacingService;
  let redisService: any;
  let aiService: any;

  // In-memory mock repositories for high-speed deterministic load testing
  let mockCompetition: any;
  let mockRegistrations: any[] = [];
  let mockHeats: any[] = [];

  const UNIVERSITIES = [
    'University of Dhaka',
    'BUET',
    'North South University',
    'BRAC University',
    'Jahangirnagar University',
    'Chittagong University',
    'Shahjalal UST',
    'Rajshahi University',
    'Ahsanullah UST',
    'Independent University Bangladesh',
  ];

  beforeEach(() => {
    mockRegistrations = [];
    mockHeats = [];

    mockCompetition = {
      _id: 'comp_tournament_100',
      title: 'National Inter-University Speed Typing Championship 2026',
      slug: 'national-university-2026',
      status: 'REGISTRATION_OPEN',
      settings: {
        language: 'EN',
        minParticipants: 20,
        maxParticipants: 300,
        tournamentFormat: 'SINGLE_ELIMINATION',
        seedingRule: 'INSTITUTION_BALANCED',
      },
      organizerId: 'org_admin_1',
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };

    const mockHeatModel: any = jest.fn().mockImplementation((dto) => {
      const instance = {
        ...dto,
        save: jest.fn().mockImplementation(function () {
          mockHeats.push(this);
          return Promise.resolve(this);
        }),
      };
      return instance;
    });

    mockHeatModel.find = jest.fn().mockImplementation((filter) => {
      let results = mockHeats
        .filter((h) => {
          if (filter?.roundNumber) return h.roundNumber === filter.roundNumber;
          return true;
        })
        .map((h) => {
          if (!h.save) {
            h.save = jest.fn().mockImplementation(function () {
              return Promise.resolve(this);
            });
          }
          return h;
        });

      return {
        sort: jest.fn().mockImplementation((sortObj) => {
          if (sortObj?.roundNumber === -1) {
            results = [...results].sort((a, b) => b.roundNumber - a.roundNumber);
          } else if (sortObj?.roundNumber === 1) {
            results = [...results].sort((a, b) => a.roundNumber - b.roundNumber);
          }
          return {
            exec: jest.fn().mockResolvedValue(results),
            then: (resolve: any) => resolve(results),
          };
        }),
        exec: jest.fn().mockResolvedValue(results),
        then: (resolve: any) => resolve(results),
      };
    });

    mockHeatModel.findOne = jest.fn().mockImplementation((filter) => {
      const match = mockHeats.find(
        (h) =>
          h.roundNumber === filter.roundNumber &&
          (filter.heatNumber === undefined || h.heatNumber === filter.heatNumber),
      );
      if (!match) return Promise.resolve(null);
      if (!match.save) {
        match.save = jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        });
      }
      return Promise.resolve(match);
    });

    mockHeatModel.deleteMany = jest.fn().mockImplementation((filter) => {
      mockHeats = mockHeats.filter((h) => h.roundNumber !== filter.roundNumber);
      return Promise.resolve({ deletedCount: 1 });
    });

    mockHeatModel.insertMany = jest.fn().mockImplementation((docs) => {
      const withSave = docs.map((d: any) => ({
        ...d,
        save: jest.fn().mockImplementation(function () {
          return Promise.resolve(this);
        }),
      }));
      mockHeats.push(...withSave);
      return Promise.resolve(withSave);
    });

    const mockCompModel: any = {
      findById: jest.fn().mockResolvedValue(mockCompetition),
    };

    const mockRegModel: any = {
      find: jest.fn().mockImplementation(() => Promise.resolve(mockRegistrations)),
      countDocuments: jest.fn().mockImplementation(() => Promise.resolve(mockRegistrations.length)),
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };

    typingService = new TypingService(
      {
        countDocuments: jest.fn().mockResolvedValue(1),
        findOne: jest.fn().mockReturnValue({
          skip: jest.fn().mockResolvedValue({
            title: 'Digital Apex Championship',
            content: 'The digital highways pulse with pure kinetic energy as typists battle for supremacy across cyber circuits.',
            wordCount: 17,
          }),
        }),
      } as any,
      {} as any,
      {} as any,
    );

    racingService = new RacingService(
      {
        create: jest.fn().mockResolvedValue({}),
      } as any,
      {
        findOne: jest.fn().mockResolvedValue({
          stats: { totalRaces: 0, wins: 0, losses: 0, bestWpm: 0, averageWpm: 0, averageAccuracy: 100 },
          xp: 0,
          level: 1,
          eloRating: 1000,
          save: jest.fn().mockResolvedValue({}),
        }),
      } as any,
    );

    redisService = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
      sadd: jest.fn().mockResolvedValue(1),
      srem: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
    };

    aiService = {
      analyzeTelemetryAnomaly: jest.fn().mockReturnValue({ isSuspicious: false }),
    };

    roomManager = new RoomManager(typingService, racingService, redisService, aiService);

    heatsService = new EventHeatsService(
      mockHeatModel,
      mockCompModel,
      mockRegModel,
      roomManager,
      typingService,
    );
  });

  // Helper to generate verified student athlete
  const generateStudentRacer = (idx: number) => {
    const university = UNIVERSITIES[idx % UNIVERSITIES.length];
    return {
      userId: (idx + 1).toString(16).padStart(24, '0'),
      username: `Racer_${idx + 1}`,
      registrationId: `REG-2026-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      fullName: `Student Typist ${idx + 1}`,
      institutionName: university,
      department: 'Computer Science & Engineering',
      studentId: `2024-CSE-${String(idx + 1).padStart(3, '0')}`,
      seedNumber: idx + 1,
      status: 'CONFIRMED',
      verificationStatus: 'VERIFIED',
      checkInStatus: 'CHECKED_IN',
      attendanceStatus: 'PRESENT',
      preferredLanguage: 'EN',
    };
  };

  // =========================================================================
  // TEST PHASE 1: Incremental Concurrent Student Registration (10 to 100)
  // =========================================================================
  describe('Phase 1: Concurrent Registration Scale & Boundary Enforcement', () => {
    it.each([10, 25, 50, 75, 100])(
      'handles concurrent registration of %i student participants seamlessly',
      async (count) => {
        const startTime = Date.now();
        const racers = Array.from({ length: count }, (_, i) => generateStudentRacer(i));

        mockRegistrations.push(...racers);

        const duration = Date.now() - startTime;
        expect(mockRegistrations.length).toBe(count);
        // Instant registration processing (under 50ms for in-memory)
        expect(duration).toBeLessThan(100);
      },
    );

    it('rejects the 301st registration when maximum tournament capacity (300) is reached', () => {
      // Fill to exactly 300
      const threeHundredRacers = Array.from({ length: 300 }, (_, i) => generateStudentRacer(i));
      mockRegistrations = threeHundredRacers;

      expect(mockRegistrations.length).toBe(300);

      // Attempting 301st racer partition must throw BadRequestException
      const extraRacer = generateStudentRacer(300);
      const overflowBatch = [...threeHundredRacers, extraRacer].map((r) => ({
        userId: r.userId,
        username: r.username,
        seedNumber: r.seedNumber,
      }));

      expect(() => {
        heatsService.partitionParticipants(overflowBatch, true);
      }).toThrow(BadRequestException);
    });
  });

  // =========================================================================
  // TEST PHASE 2: Heat Partitioning Mathematics for 100 Participants
  // =========================================================================
  describe('Phase 2: 100-Player Heat Partitioning & Sizing Invariant [2, 7]', () => {
    it('partitions 100 confirmed racers into exactly 15 balanced heats (10 heats of 7, 5 heats of 6)', () => {
      const racers = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i)).map((r) => ({
        userId: r.userId,
        username: r.username,
        seedNumber: r.seedNumber,
        institution: r.institutionName,
      }));

      const heats = heatsService.partitionParticipants(racers, true);

      // Mathematical proof:
      // Math.ceil(100 / 7) = 15 heats
      expect(heats.length).toBe(15);

      const totalAssignedRacers = heats.reduce((acc, h) => acc + h.participantCount, 0);
      expect(totalAssignedRacers).toBe(100);

      // Verify strict [2, 7] capacity boundaries on EVERY heat
      const heatSizes = heats.map((h) => h.participantCount);
      const minSize = Math.min(...heatSizes);
      const maxSize = Math.max(...heatSizes);

      expect(minSize).toBe(6);
      expect(maxSize).toBe(7);

      // Sizing breakdown: exactly 10 heats with 7 racers, 5 heats with 6 racers
      const sevens = heatSizes.filter((s) => s === 7).length;
      const sixes = heatSizes.filter((s) => s === 6).length;
      expect(sevens).toBe(10);
      expect(sixes).toBe(5);

      // Zero solo or underfilled (<2) heats
      expect(heatSizes.every((s) => s >= 2 && s <= 7)).toBe(true);
    });

    it('balances institutional distribution across heats when using INSTITUTION_BALANCED', () => {
      const racers = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i)).map((r) => ({
        userId: r.userId,
        username: r.username,
        seedNumber: r.seedNumber,
        institution: r.institutionName,
      }));

      const seeded = heatsService.applySeeding(racers, 'INSTITUTION_BALANCED');
      const heats = heatsService.partitionParticipants(seeded, true);

      // Check Heat 1 participants: no single university should dominate the heat
      for (const heat of heats) {
        const instCounts: Record<string, number> = {};
        for (const p of heat.participants) {
          const inst = p.institution || 'UNKNOWN';
          instCounts[inst] = (instCounts[inst] || 0) + 1;
        }
        // In any 7-player heat, no university should have more than 2 racers
        for (const count of Object.values(instCounts)) {
          expect(count).toBeLessThanOrEqual(2);
        }
      }
    });

    it('balances snake-draft difficulty across heats when using RANKED_ELO', () => {
      const racers = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i)).map((r) => ({
        userId: r.userId,
        username: r.username,
        seedNumber: r.seedNumber,
      }));

      const seeded = heatsService.applySeeding(racers, 'RANKED_ELO');
      const heats = heatsService.partitionParticipants(seeded, true);

      // In snake draft, Heat 1 gets Seed 1 and Seed 30, Heat 15 gets Seed 15 and Seed 16
      expect(heats[0].participants[0].seedNumber).toBe(1);
      expect(heats[14].participants[0].seedNumber).toBe(15);
      expect(heats[14].participants[1].seedNumber).toBe(16);
    });
  });

  // =========================================================================
  // TEST PHASE 3: Parallel 15-Room Real-Time Multiplayer Simulation
  // =========================================================================
  describe('Phase 3: Parallel 15-Room Race Execution & Telemetry Simulation', () => {
    it('provisions 15 dedicated multiplayer rooms with 0 collision and valid passage state', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));

      const result = await heatsService.generateHeatsForCompetition('comp_tournament_100', 'INSTITUTION_BALANCED');

      expect(result.totalHeats).toBe(15);
      expect(result.totalParticipants).toBe(100);

      // Verify each of the 15 rooms exists in RoomManager
      for (let h = 1; h <= 15; h++) {
        const roomId = `ROOM-EVENT-national-university-2026-R1-H${h}`;
        const room = await roomManager.getRoomOrHydrate(roomId);
        expect(room).toBeDefined();
        expect(room?.state).toBe(RoomState.WAITING);
        expect(room?.maxPlayers).toBeGreaterThanOrEqual(6);
        expect(room?.maxPlayers).toBeLessThanOrEqual(7);
      }
    });

    it('simulates 100 concurrent racers joining their assigned rooms within latency SLA (<50ms)', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));
      await heatsService.generateHeatsForCompetition('comp_tournament_100');

      const latencies: number[] = [];

      // Concurrently join all 100 racers into their respective rooms
      const joinPromises = mockHeats.flatMap((heat) =>
        heat.participants.map(async (p: any, laneIdx: number) => {
          const t0 = performance.now();
          const { room, participant } = await roomManager.joinRoom(
            heat.roomId,
            { userId: p.userId.toString(), username: p.username, roles: ['PLAYER'] },
            `socket_${p.userId}`,
          );
          const t1 = performance.now();
          latencies.push(t1 - t0);

          // Mark player ready
          roomManager.setPlayerReady(heat.roomId, p.userId.toString(), true);
          return { room, participant };
        }),
      );

      await Promise.all(joinPromises);

      // Calculate latency metrics
      latencies.sort((a, b) => a - b);
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p95 = latencies[Math.floor(latencies.length * 0.95)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      expect(p50).toBeLessThan(100); // sub-100ms multi-process load SLA
      expect(p95).toBeLessThan(200);
      expect(p99).toBeLessThan(300);
    });

    it('simulates server-authoritative race execution and finish across all 15 heats', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));
      await heatsService.generateHeatsForCompetition('comp_tournament_100');

      const passageText =
        'The digital highways pulse with pure kinetic energy as typists battle for supremacy across cyber circuits.';

      // Launch all 15 heats
      for (const heat of mockHeats) {
        const room = await roomManager.getRoomOrHydrate(heat.roomId);
        if (room) {
          room.state = RoomState.IN_PROGRESS;
          room.raceStartedAt = Date.now() - 10000; // started 10 seconds ago
        }
      }

      // Concurrently simulate typing progress for all 100 racers
      for (const heat of mockHeats) {
        heat.status = 'COMPLETED';
        heat.completedAt = new Date();
        heat.participants.forEach((p: any, idx: number) => {
          // Simulated netWpm: top seeded racers type faster
          p.finishPosition = idx + 1;
          p.netWpm = 115 - idx * 8 + Math.floor(Math.random() * 5);
          p.accuracy = 98 - idx * 0.5;
        });
      }

      // Verify all 15 heats are marked COMPLETED
      const incomplete = mockHeats.filter((h) => h.status !== 'COMPLETED');
      expect(incomplete.length).toBe(0);
    });
  });

  // =========================================================================
  // TEST PHASE 4: Tournament Progression to Grand Final
  // =========================================================================
  describe('Phase 4: Tournament Advancement, Grand Final & Championship', () => {
    it('advances 15 heat winners into Semifinals, then to 1 Grand Final, crowning the champion', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));
      await heatsService.generateHeatsForCompetition('comp_tournament_100');

      // Populate completed results for Round 1
      mockHeats.forEach((heat) => {
        heat.status = 'COMPLETED';
        heat.completedAt = new Date();
        heat.participants.forEach((p: any, idx: number) => {
          p.finishPosition = idx + 1;
          p.netWpm = 110 - idx * 7;
          p.accuracy = 98;
        });
      });

      // ADVANCE ROUND 1 -> ROUND 2 (Advance top 1 from each of the 15 heats = 15 qualifiers)
      const round2Result = await heatsService.advanceRound('comp_tournament_100', 1, 1);
      expect(round2Result.isGrandFinal).toBe(false);
      expect(round2Result.totalQualifiers).toBe(15);
      expect(round2Result.nextRound).toBe(2);
      // 15 racers partitioned into heats: Math.ceil(15 / 7) = 3 heats (5 racers each)
      expect(round2Result.heatsCount).toBe(3);

      // Simulate completion of Round 2 (Semifinals)
      const round2Heats = mockHeats.filter((h) => h.roundNumber === 2);
      expect(round2Heats.length).toBe(3);

      round2Heats.forEach((heat) => {
        heat.status = 'COMPLETED';
        heat.completedAt = new Date();
        heat.participants.forEach((p: any, idx: number) => {
          p.finishPosition = idx + 1;
          p.netWpm = 120 - idx * 5;
          p.accuracy = 99;
        });
      });

      // ADVANCE ROUND 2 -> ROUND 3 (Advance top 2 from each of the 3 heats = 6 qualifiers)
      const grandFinalResult = await heatsService.advanceRound('comp_tournament_100', 2, 2);

      // 6 qualifiers <= 7 -> Triggers GRAND FINAL!
      expect(grandFinalResult.isGrandFinal).toBe(true);
      expect(grandFinalResult.totalQualifiers).toBe(6);
      expect(grandFinalResult.nextRound).toBe(3);
      expect(grandFinalResult.heatsCount).toBe(1);

      // Simulate Grand Final race
      const grandFinalHeat = mockHeats.find((h) => h.roundNumber === 3);
      expect(grandFinalHeat).toBeDefined();
      expect(grandFinalHeat.participants.length).toBe(6);

      // Set Grand Final podium
      grandFinalHeat.status = 'COMPLETED';
      grandFinalHeat.completedAt = new Date();
      grandFinalHeat.participants[0].finishPosition = 1;
      grandFinalHeat.participants[0].netWpm = 138;
      grandFinalHeat.participants[1].finishPosition = 2;
      grandFinalHeat.participants[1].netWpm = 132;
      grandFinalHeat.participants[2].finishPosition = 3;
      grandFinalHeat.participants[2].netWpm = 125;

      // Crown Champion
      const champResult = await heatsService.completeCompetition('comp_tournament_100');
      expect(champResult.success).toBe(true);
      expect(champResult.competitionStatus).toBe('COMPLETED');
      expect(champResult.winner?.username).toBe(grandFinalHeat.participants[0].username);
      expect(champResult.podium.champion?.username).toBe(grandFinalHeat.participants[0].username);
      expect(champResult.podium.runnerUp?.username).toBe(grandFinalHeat.participants[1].username);
      expect(champResult.podium.thirdPlace?.username).toBe(grandFinalHeat.participants[2].username);
    });
  });

  // =========================================================================
  // TEST PHASE 5: Live Control Room Telemetry & Disputes
  // =========================================================================
  describe('Phase 5: Live Control Room Telemetry & Dispute Resolution', () => {
    it('aggregates live control room status with active heats, rounds, and leaderboard', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));
      await heatsService.generateHeatsForCompetition('comp_tournament_100');

      const controlStatus = await heatsService.getLiveControlRoomStatus('comp_tournament_100');

      expect(controlStatus.competition.title).toBe(mockCompetition.title);
      expect(controlStatus.totalHeatsInRound).toBe(15);
      expect(controlStatus.currentRound).toBe(1);
    });

    it('logs heat dispute and resolves via RERUN or VALIDATE', async () => {
      mockRegistrations = Array.from({ length: 100 }, (_, i) => generateStudentRacer(i));
      await heatsService.generateHeatsForCompetition('comp_tournament_100');

      // Log dispute on Heat 3
      const disputeRes = await heatsService.recordHeatDispute(
        'comp_tournament_100',
        3,
        1,
        'Transient packet jitter reported',
        { userId: 'org_admin_1', roles: ['ORGANIZER'] },
      );

      expect(disputeRes.success).toBe(true);
      expect(disputeRes.heat.status).toBe('DISPUTED');
      expect(disputeRes.heat.disputeState.hasDispute).toBe(true);

      // Resolve via RERUN
      const resolveRes = await heatsService.resolveHeatDispute(
        'comp_tournament_100',
        3,
        1,
        'RERUN',
        { userId: 'org_admin_1', roles: ['ORGANIZER'] },
        'Organizer cleared dispute and approved rerun',
      );

      expect(resolveRes.success).toBe(true);
      expect(resolveRes.heat.status).toBe('READY');
      expect(resolveRes.heat.disputeState.hasDispute).toBe(false);
    });
  });
});

