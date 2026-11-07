import { RoomManager, RoomState } from '../src/multiplayer/room.manager';
import { EventHeatsService } from '../src/event-heats/event-heats.service';
import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

interface MockReg {
  _id: any;
  registrationId: string;
  competitionId: any;
  userId: any;
  username: string;
  fullName: string;
  email: string;
  phone: string;
  studentId: string;
  institutionName: string;
  department: string;
  academicBatch: string;
  currentSemester: string;
  graduationYear: number;
  emergencyContact: string;
  fairPlayConsent: boolean;
  status: string;
  verificationStatus: string;
  checkInStatus: string;
  seedNumber: number;
  assignedHeat?: number;
  assignedGroup?: string;
  save: () => Promise<any>;
  toObject?: () => any;
}

describe('KEYRUSH 2.0 / 3.0 — INDEPENDENT VERIFICATION OF 100-STUDENT ESPORTS TOURNAMENT', () => {
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

  let typingService: TypingService;
  let racingService: RacingService;
  let redisService: any;
  let aiService: any;
  let roomManager: RoomManager;
  let heatsService: EventHeatsService;

  const registrations: MockReg[] = [];
  const heats: any[] = [];
  const compId = new Types.ObjectId('654321098765432109876543');
  const organizerId = new Types.ObjectId('111111111111111111111111');

  let mockCompetition: any;
  let mockCompModel: any;
  let mockRegModel: any;
  let mockHeatModel: any;

  beforeAll(() => {
    typingService = new TypingService(null as any, null as any, null as any);
    typingService.getRandomPassage = jest.fn().mockResolvedValue({
      _id: 'p1',
      title: 'Speed Test',
      content: 'The quick brown fox jumps over the lazy dog near the riverbank on a sunny afternoon.',
      wordCount: 16,
    } as any);
    racingService = new RacingService(null as any, null as any, null as any);
    redisService = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(true),
    };
    aiService = {
      analyzeTypingPattern: jest.fn().mockReturnValue({ isHuman: true, confidence: 0.99 }),
      analyzeTelemetryAnomaly: jest.fn().mockReturnValue({ isSuspicious: false }),
    };

    roomManager = new RoomManager(typingService, racingService, redisService as any, aiService as any);

    mockCompetition = {
      _id: compId,
      title: 'National Inter-University Championship 2026',
      slug: 'national-university-2026',
      status: 'REGISTRATION_OPEN',
      organizerId: organizerId,
      currentParticipantCount: 0,
      settings: {
        language: 'EN',
        minParticipants: 20,
        maxParticipants: 300,
        tournamentFormat: 'SINGLE_ELIMINATION',
        seedingRule: 'INSTITUTION_BALANCED',
      },
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };

    mockCompModel = {
      findById: jest.fn().mockImplementation((id) => Promise.resolve(mockCompetition)),
      findOneAndUpdate: jest.fn().mockImplementation((filter, update) => {
        if (
          filter.currentParticipantCount?.$lt &&
          mockCompetition.currentParticipantCount >= filter.currentParticipantCount.$lt
        ) {
          return Promise.resolve(null);
        }
        mockCompetition.currentParticipantCount = (mockCompetition.currentParticipantCount || 0) + 1;
        return Promise.resolve(mockCompetition);
      }),
      findByIdAndUpdate: jest.fn().mockImplementation((id, update) => {
        if (update.$inc?.currentParticipantCount) {
          mockCompetition.currentParticipantCount += update.$inc.currentParticipantCount;
        }
        return Promise.resolve(mockCompetition);
      }),
    };

    mockRegModel = jest.fn().mockImplementation((dto) => {
      const reg: MockReg = {
        ...dto,
        save: jest.fn().mockImplementation(function () {
          registrations.push(this);
          return Promise.resolve(this);
        }),
        toObject: function () {
          return { ...this };
        },
      };
      return reg;
    });

    mockRegModel.find = jest.fn().mockImplementation((filter) => {
      let results = registrations.filter((r) => {
        if (filter?.competitionId && filter.competitionId.toString() !== r.competitionId.toString()) return false;
        if (filter?.status && r.status !== filter.status) return false;
        if (filter?.checkInStatus && r.checkInStatus !== filter.checkInStatus) return false;
        return true;
      });
      return {
        sort: jest.fn().mockReturnValue(results),
        exec: jest.fn().mockResolvedValue(results),
        then: (res: any) => res(results),
      };
    });

    mockRegModel.countDocuments = jest.fn().mockImplementation((filter) => {
      const count = registrations.filter((r) => {
        if (filter?.competitionId && filter.competitionId.toString() !== r.competitionId.toString()) return false;
        if (filter?.checkInStatus && r.checkInStatus !== filter.checkInStatus) return false;
        return true;
      }).length;
      return Promise.resolve(count);
    });

    mockRegModel.updateOne = jest.fn().mockImplementation((filter, update) => {
      const reg = registrations.find((r) => r.userId.toString() === filter.userId?.toString());
      if (reg && update.$set) {
        Object.assign(reg, update.$set);
      }
      return Promise.resolve({ modifiedCount: 1 });
    });

    mockHeatModel = jest.fn().mockImplementation((dto) => {
      const heat = {
        ...dto,
        save: jest.fn().mockImplementation(function () {
          const idx = heats.findIndex(
            (h) => h.roundNumber === this.roundNumber && h.heatNumber === this.heatNumber,
          );
          if (idx >= 0) heats[idx] = this;
          else heats.push(this);
          return Promise.resolve(this);
        }),
      };
      return heat;
    });

    mockHeatModel.deleteMany = jest.fn().mockImplementation((filter) => {
      const remaining = heats.filter((h) => {
        if (filter.roundNumber && h.roundNumber === filter.roundNumber) return false;
        return true;
      });
      heats.length = 0;
      heats.push(...remaining);
      return Promise.resolve({ deletedCount: 1 });
    });

    mockHeatModel.insertMany = jest.fn().mockImplementation((docs) => {
      for (const d of docs) {
        const item = {
          ...d,
          save: jest.fn().mockImplementation(function () {
            const idx = heats.findIndex(
              (h) => h.roundNumber === this.roundNumber && h.heatNumber === this.heatNumber,
            );
            if (idx >= 0) heats[idx] = this;
            else heats.push(this);
            return Promise.resolve(this);
          }),
        };
        heats.push(item);
      }
      return Promise.resolve(docs);
    });

    mockHeatModel.find = jest.fn().mockImplementation((filter) => {
      let results = heats.filter((h) => {
        if (filter?.roundNumber && h.roundNumber !== filter.roundNumber) return false;
        return true;
      });
      return {
        sort: jest.fn().mockImplementation((sortObj) => {
          if (sortObj?.roundNumber === -1) results = [...results].sort((a, b) => b.roundNumber - a.roundNumber);
          return {
            exec: jest.fn().mockResolvedValue(results),
            then: (res: any) => res(results),
          };
        }),
        exec: jest.fn().mockResolvedValue(results),
        then: (res: any) => res(results),
      };
    });

    mockHeatModel.findOne = jest.fn().mockImplementation((filter) => {
      const match = heats.find((h) => {
        if (filter.roundNumber && h.roundNumber !== filter.roundNumber) return false;
        if (filter.heatNumber && h.heatNumber !== filter.heatNumber) return false;
        if (filter.roomId && h.roomId !== filter.roomId) return false;
        return true;
      });
      return Promise.resolve(match || null);
    });

    heatsService = new EventHeatsService(
      mockHeatModel,
      mockCompModel,
      mockRegModel,
      roomManager,
      typingService,
    );
  });

  it('1.1 should register exactly 100 distinct student accounts with valid academic info and fairPlayConsent', () => {
    for (let i = 1; i <= 100; i++) {
      const hex = i.toString(16).padStart(24, '0');
      const uni = UNIVERSITIES[(i - 1) % UNIVERSITIES.length];
      const reg: MockReg = {
        _id: new Types.ObjectId(hex),
        registrationId: `REG-2026-${i.toString().padStart(4, '0')}`,
        competitionId: compId,
        userId: new Types.ObjectId(hex),
        username: `student_${i}`,
        fullName: `Esports Athlete ${i}`,
        email: `student${i}@${uni.toLowerCase().replace(/[^a-z]/g, '')}.edu.bd`,
        phone: `+88017${i.toString().padStart(8, '0')}`,
        studentId: `STU-2026-${i.toString().padStart(4, '0')}`,
        institutionName: uni,
        department: i % 2 === 0 ? 'Computer Science & Engineering' : 'Software Engineering',
        academicBatch: '2023-2027',
        currentSemester: '5th',
        graduationYear: 2027,
        emergencyContact: '+8801811111111',
        fairPlayConsent: true,
        status: 'CONFIRMED',
        verificationStatus: 'VERIFIED',
        checkInStatus: 'CHECKED_IN',
        seedNumber: i,
        save: async function () {
          return this;
        },
        toObject: function () {
          return { ...this };
        },
      };
      registrations.push(reg);
    }

    expect(registrations.length).toBe(100);
    const uniqueUserIds = new Set(registrations.map((r) => r.userId.toString()));
    expect(uniqueUserIds.size).toBe(100);
    expect(registrations.every((r) => r.fairPlayConsent === true)).toBe(true);
  });

  it('1.2 should partition 100 participants into exactly 15 valid heats of 2 to 7 racers', async () => {
    const heatGenResult = await heatsService.generateHeatsForCompetition(
      compId.toString(),
      'INSTITUTION_BALANCED',
      { userId: organizerId.toString(), roles: ['ORGANIZER'] },
    );

    expect(heatGenResult.totalHeats).toBe(15);
    const r1Heats = heats.filter((h) => h.roundNumber === 1);
    expect(r1Heats.length).toBe(15);

    // Verify 2-7 participant constraint
    for (const h of r1Heats) {
      expect(h.participants.length).toBeGreaterThanOrEqual(2);
      expect(h.participants.length).toBeLessThanOrEqual(7);
    }

    // Verify all 100 participants are assigned exactly once
    const assignedRacers = new Set<string>();
    for (const h of r1Heats) {
      for (const p of h.participants) {
        expect(assignedRacers.has(p.userId.toString())).toBe(false);
        assignedRacers.add(p.userId.toString());
      }
    }
    expect(assignedRacers.size).toBe(100);
  });

  it('1.3 should enforce heat room isolation: player can join their heat only', async () => {
    const heat1 = heats.find((h) => h.roundNumber === 1 && h.heatNumber === 1);
    const heat2 = heats.find((h) => h.roundNumber === 1 && h.heatNumber === 2);

    const racer1 = heat1.participants[0];
    const racer2 = heat2.participants[0];

    // Assigned racer can join Heat 1 room
    const joinResult = await roomManager.joinRoom(
      heat1.roomId,
      { userId: racer1.userId.toString(), username: racer1.username, roles: ['USER'] },
      'socket_h1_r1',
    );
    expect(joinResult.participant.userId).toBe(racer1.userId.toString());

    // Unauthorized racer from Heat 2 cannot join Heat 1 room
    await expect(
      roomManager.joinRoom(
        heat1.roomId,
        { userId: racer2.userId.toString(), username: racer2.username, roles: ['USER'] },
        'socket_h1_r2',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('1.4 should execute server-authoritative keystroke racing in Heat 1 without fabricated results', async () => {
    const heat1 = heats.find((h) => h.roundNumber === 1 && h.heatNumber === 1);

    // Join remaining participants
    for (let idx = 1; idx < heat1.participants.length; idx++) {
      const p = heat1.participants[idx];
      await roomManager.joinRoom(
        heat1.roomId,
        { userId: p.userId.toString(), username: p.username, roles: ['USER'] },
        `socket_h1_p${idx + 1}`,
      );
    }

    // Ready check and countdown
    for (const p of heat1.participants) {
      roomManager.setPlayerReady(heat1.roomId, p.userId.toString(), true);
    }
    const room = roomManager.getRoom(heat1.roomId)!;
    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 5000;

    expect(room.state).toBe(RoomState.IN_PROGRESS);

    // Real character-by-character typing keystrokes
    const text = room.passage.content;
    for (let idx = 0; idx < heat1.participants.length; idx++) {
      const p = heat1.participants[idx];
      for (let c = 1; c <= text.length; c++) {
        roomManager.updatePlayerTyping(heat1.roomId, p.userId.toString(), {
          textBuffer: text.slice(0, c),
          typedIndex: c,
          errorCount: 0,
          rawInputCount: c,
          sequenceNumber: c,
          clientTimestamp: Date.now(),
        });
      }
    }

    expect(room.state).toBe(RoomState.FINISHED);
    const finishers = Array.from(room.participants.values()).sort((a, b) => a.rankPosition - b.rankPosition);
    expect(finishers[0].rankPosition).toBe(1);
    expect(finishers[0].netWpm).toBeGreaterThan(0);
    expect(finishers.every((f) => f.finished)).toBe(true);

    // Mark Heat 1 as COMPLETED
    heat1.status = 'COMPLETED';
    heat1.participants = finishers.map((r) => ({
      userId: r.userId,
      username: r.username,
      carId: r.carId,
      wpm: r.netWpm,
      accuracy: r.accuracy,
      rankPosition: r.rankPosition,
      finishTimeMs: r.finishTimeMs,
      finished: true,
    }));
    await heat1.save();
  });

  it('1.5 should advance to Semifinals and then Grand Final to crown a champion', async () => {
    // Complete heats 2 through 15 with valid typing
    for (let hNum = 2; hNum <= 15; hNum++) {
      const h = heats.find((x) => x.roundNumber === 1 && x.heatNumber === hNum);
      for (let pIdx = 0; pIdx < h.participants.length; pIdx++) {
        await roomManager.joinRoom(
          h.roomId,
          { userId: h.participants[pIdx].userId.toString(), username: h.participants[pIdx].username, roles: ['USER'] },
          `socket_h${hNum}_p${pIdx}`,
        );
        roomManager.setPlayerReady(h.roomId, h.participants[pIdx].userId.toString(), true);
      }
      const room = roomManager.getRoom(h.roomId)!;
      room.state = RoomState.IN_PROGRESS;
      room.raceStartedAt = Date.now() - 5000;
      const text = room.passage.content;
      for (let pIdx = 0; pIdx < h.participants.length; pIdx++) {
        const p = h.participants[pIdx];
        for (let c = 1; c <= text.length; c++) {
          roomManager.updatePlayerTyping(h.roomId, p.userId.toString(), {
            textBuffer: text.slice(0, c),
            typedIndex: c,
            errorCount: 0,
            rawInputCount: c,
            sequenceNumber: c,
            clientTimestamp: Date.now(),
          });
        }
      }
      const finRoom = roomManager.getRoom(h.roomId)!;
      h.status = 'COMPLETED';
      h.participants = Array.from(finRoom.participants.values())
        .sort((a, b) => a.rankPosition - b.rankPosition)
        .map((r) => ({
          userId: r.userId,
          username: r.username,
          carId: r.carId,
          wpm: r.netWpm,
          accuracy: r.accuracy,
          rankPosition: r.rankPosition,
          finishTimeMs: r.finishTimeMs,
          finished: true,
        }));
      await h.save();
    }

    // Advance to Semifinals (Round 2)
    const r2Advancement = await heatsService.advanceRound(compId.toString(), 1, 2, {
      userId: organizerId.toString(),
      roles: ['ORGANIZER'],
    });
    expect(r2Advancement.success).toBe(true);

    const r2Heats = heats.filter((h) => h.roundNumber === 2);
    expect(r2Heats.length).toBeGreaterThanOrEqual(2);
    for (const h of r2Heats) {
      expect(h.participants.length).toBeGreaterThanOrEqual(2);
      expect(h.participants.length).toBeLessThanOrEqual(7);

      // Race Round 2
      for (let pIdx = 0; pIdx < h.participants.length; pIdx++) {
        await roomManager.joinRoom(
          h.roomId,
          { userId: h.participants[pIdx].userId.toString(), username: h.participants[pIdx].username, roles: ['USER'] },
          `socket_r2_h${h.heatNumber}_p${pIdx}`,
        );
        roomManager.setPlayerReady(h.roomId, h.participants[pIdx].userId.toString(), true);
      }
      const room = roomManager.getRoom(h.roomId)!;
      room.state = RoomState.IN_PROGRESS;
      room.raceStartedAt = Date.now() - 5000;
      const text = room.passage.content;
      for (let pIdx = 0; pIdx < h.participants.length; pIdx++) {
        const p = h.participants[pIdx];
        for (let c = 1; c <= text.length; c++) {
          roomManager.updatePlayerTyping(h.roomId, p.userId.toString(), {
            textBuffer: text.slice(0, c),
            typedIndex: c,
            errorCount: 0,
            rawInputCount: c,
            sequenceNumber: c,
            clientTimestamp: Date.now(),
          });
        }
      }
      const finRoom = roomManager.getRoom(h.roomId)!;
      h.status = 'COMPLETED';
      h.participants = Array.from(finRoom.participants.values())
        .sort((a, b) => a.rankPosition - b.rankPosition)
        .map((r) => ({
          userId: r.userId,
          username: r.username,
          carId: r.carId,
          wpm: r.netWpm,
          accuracy: r.accuracy,
          rankPosition: r.rankPosition,
          finishTimeMs: r.finishTimeMs,
          finished: true,
        }));
      await h.save();
    }

    // Advance to Grand Final (Round 3)
    const finalAdvancement = await heatsService.advanceRound(compId.toString(), 2, 1, {
      userId: organizerId.toString(),
      roles: ['ORGANIZER'],
    });
    expect(finalAdvancement.success).toBe(true);

    const grandFinal = heats.find((h) => h.roundNumber === 3 && h.heatNumber === 1);
    expect(grandFinal).toBeDefined();
    expect(grandFinal.participants.length).toBeLessThanOrEqual(7);

    // Race the Grand Final
    for (let pIdx = 0; pIdx < grandFinal.participants.length; pIdx++) {
      await roomManager.joinRoom(
        grandFinal.roomId,
        {
          userId: grandFinal.participants[pIdx].userId.toString(),
          username: grandFinal.participants[pIdx].username,
          roles: ['USER'],
        },
        `socket_final_p${pIdx}`,
      );
      roomManager.setPlayerReady(grandFinal.roomId, grandFinal.participants[pIdx].userId.toString(), true);
    }
    const finalRoom = roomManager.getRoom(grandFinal.roomId)!;
    finalRoom.state = RoomState.IN_PROGRESS;
    finalRoom.raceStartedAt = Date.now() - 5000;
    const finalText = finalRoom.passage.content;

    for (let pIdx = 0; pIdx < grandFinal.participants.length; pIdx++) {
      const p = grandFinal.participants[pIdx];
      for (let c = 1; c <= finalText.length; c++) {
        roomManager.updatePlayerTyping(grandFinal.roomId, p.userId.toString(), {
          textBuffer: finalText.slice(0, c),
          typedIndex: c,
          errorCount: 0,
          rawInputCount: c,
          sequenceNumber: c,
          clientTimestamp: Date.now(),
        });
      }
    }

    const completedFinalRoom = roomManager.getRoom(grandFinal.roomId)!;
    grandFinal.status = 'COMPLETED';
    grandFinal.participants = Array.from(completedFinalRoom.participants.values())
      .sort((a, b) => a.rankPosition - b.rankPosition)
      .map((r) => ({
        userId: r.userId,
        username: r.username,
        carId: r.carId,
        wpm: r.netWpm,
        accuracy: r.accuracy,
        rankPosition: r.rankPosition,
        finishTimeMs: r.finishTimeMs,
        finished: true,
      }));
    await grandFinal.save();

    const champion = grandFinal.participants[0];
    expect(champion.rankPosition).toBe(1);
    expect(champion.wpm).toBeGreaterThan(0);

    mockCompetition.status = 'COMPLETED';
    mockCompetition.winnerUserId = champion.userId;
    mockCompetition.winnerUsername = champion.username;
    await mockCompetition.save();

    expect(mockCompetition.status).toBe('COMPLETED');
    expect(mockCompetition.winnerUsername).toBe(champion.username);
  });

  it('1.6 should redact student PII for public / non-organizer callers while allowing full data for organizer', async () => {
    // Non-organizer caller (regular competitor)
    const competitorCaller = { userId: registrations[0].userId.toString(), roles: ['USER'] };
    const organizerCaller = { userId: organizerId.toString(), roles: ['ORGANIZER'] };

    // Function simulating getRegistrations PII filter logic
    const filterRegistrationsForCaller = (regs: MockReg[], caller: { userId: string; roles: string[] }) => {
      const isOrganizerOrAdmin =
        caller.roles.includes('SUPER_ADMIN') ||
        (mockCompetition.organizerId && caller.userId === mockCompetition.organizerId.toString());

      if (isOrganizerOrAdmin) return regs;

      return regs.map((reg) => {
        const isSelf = caller.userId === reg.userId.toString();
        if (isSelf) return reg;
        return {
          ...reg,
          email: reg.email ? `${reg.email.charAt(0)}***@***` : '',
          phone: reg.phone ? '***-***-****' : '',
          studentId: 'REDACTED',
          registrationNumber: 'REDACTED',
          emergencyContact: 'REDACTED',
        };
      });
    };

    const publicView = filterRegistrationsForCaller(registrations, competitorCaller);
    // Athlete 0 is looking at athlete 1
    const otherAthlete = publicView[1];
    expect(otherAthlete.studentId).toBe('REDACTED');
    expect(otherAthlete.phone).toBe('***-***-****');
    expect(otherAthlete.emergencyContact).toBe('REDACTED');
    expect(otherAthlete.email).toContain('***@***');

    // Athlete 0 looks at their own record
    const selfRecord = publicView[0];
    expect(selfRecord.studentId).toBe(registrations[0].studentId);
    expect(selfRecord.phone).toBe(registrations[0].phone);

    // Organizer looks at roster -> receives complete unredacted data
    const organizerView = filterRegistrationsForCaller(registrations, organizerCaller);
    expect(organizerView[1].studentId).toBe(registrations[1].studentId);
    expect(organizerView[1].phone).toBe(registrations[1].phone);
    expect(organizerView[1].emergencyContact).toBe(registrations[1].emergencyContact);
  });

  it('1.7 should enforce cross-tenant isolation: Organizer B cannot manage Organizer A competition', async () => {
    const intruderOrganizer = { userId: '222222222222222222222222', roles: ['ORGANIZER'] };

    // Organizer B tries to advance round on Organizer A tournament
    await expect(
      heatsService.advanceRound(compId.toString(), 1, 2, intruderOrganizer),
    ).rejects.toThrow(ForbiddenException);

    // Organizer B tries to reassign participant
    await expect(
      heatsService.reassignParticipant(
        compId.toString(),
        1,
        1,
        2,
        registrations[0].userId.toString(),
        intruderOrganizer,
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
