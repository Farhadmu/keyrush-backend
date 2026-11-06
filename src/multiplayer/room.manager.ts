import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { TypingService } from '../typing/typing.service';
import { RacingService } from '../racing/racing.service';
import { RedisService } from '../common/redis/redis.service';
import { AiService } from '../common/ai/ai.service';

export enum RoomState {
  WAITING = 'WAITING',
  READY = 'READY',
  COUNTDOWN = 'COUNTDOWN',
  IN_PROGRESS = 'IN_PROGRESS',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export interface RoomParticipant {
  userId: string;
  username: string;
  socketId: string;
  isGuest: boolean;
  isReady: boolean;
  carId: string;
  joinedAt: Date;
  reconnectToken: string;
  // Live race state (server-authoritative)
  typedIndex: number;
  errorCount: number;
  rawInputCount: number;
  streak: number;
  nitroActive: boolean;
  nitroEndsAt: number;
  progressPercent: number;
  netWpm: number;
  rawWpm: number;
  accuracy: number;
  speed: number;
  rankPosition: number;
  finished: boolean;
  finishTimeMs: number;
  disconnectedAt: Date | null;
  isFlaggedSuspicious: boolean;
  suspicionReason: string;
  lastWpm: number;
  lastUpdateTimestamp: number;
  lastSequenceNumber?: number;
}

export interface MultiplayerRoom {
  roomId: string;
  name: string;
  isPrivate: boolean;
  passcode?: string;
  hostUserId: string;
  minPlayers: number; // strictly 2
  maxPlayers: number; // strictly 2 to 7 (default 7)
  state: RoomState;
  passage: {
    id: string;
    title: string;
    content: string;
    wordCount: number;
    charCount: number;
  };
  participants: Map<string, RoomParticipant>; // key: userId
  spectators: Set<string>; // set of socketIds/userIds (does NOT count towards 2-7 participant limits)
  countdownSeconds: number;
  raceStartedAt: number | null;
  createdAt: Date;
  expiresAt: Date;
  replaySnapshots: Array<{
    timeMs: number;
    positions: Array<{ userId: string; progress: number; wpm: number; speed: number }>;
  }>;
}

@Injectable()
export class RoomManager {
  private readonly logger = new Logger(RoomManager.name);
  private rooms: Map<string, MultiplayerRoom> = new Map();
  private userActiveRoom: Map<string, string> = new Map();

  constructor(
    private readonly typingService: TypingService,
    private readonly racingService: RacingService,
    private readonly redisService: RedisService,
    private readonly aiService: AiService,
  ) {
    this.seedDefaultPublicRooms();
  }

  private async seedDefaultPublicRooms() {
    try {
      const passage = await this.typingService.getRandomPassage('EN');
      const roomId = 'ROOM-NEON-1';
      const content = passage?.content || 'Accelerate through the digital highway of the typing grid at maximum speed.';
      const title = passage?.title || 'Cyber Tarmac Sprint';
      const wordCount = passage?.wordCount || 12;

      this.rooms.set(roomId, {
        roomId,
        name: 'Cyber Tarmac Sprint',
        isPrivate: false,
        hostUserId: 'system_host',
        minPlayers: 2,
        maxPlayers: 7,
        state: RoomState.WAITING,
        passage: {
          id: (passage as any)?._id?.toString() || 'pass_default_1',
          title,
          content,
          wordCount,
          charCount: content.length,
        },
        participants: new Map(),
        spectators: new Set(),
        countdownSeconds: 5,
        raceStartedAt: null,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        replaySnapshots: [],
      });
    } catch (err: any) {
      this.logger.warn(`Could not seed default public room: ${err.message}`);
    }
  }

  async createRoom(
    hostUser: { userId: string; username: string; roles: string[] },
    options: {
      name?: string;
      isPrivate?: boolean;
      passcode?: string;
      maxPlayers?: number;
      language?: string;
    },
  ): Promise<MultiplayerRoom> {
    if (!hostUser || hostUser.roles.includes('GUEST')) {
      throw new ForbiddenException('Guest users cannot create multiplayer rooms. Please log in.');
    }

    // Check if user is already in an active room
    if (this.userActiveRoom.has(hostUser.userId)) {
      const existingRoomId = this.userActiveRoom.get(hostUser.userId)!;
      const existingRoom = this.rooms.get(existingRoomId);
      if (existingRoom && existingRoom.state === RoomState.IN_PROGRESS) {
        throw new BadRequestException('A player cannot participate in multiple simultaneous active races.');
      }
    }

    let max = options.maxPlayers ?? 7;
    if (max < 2 || max > 7) {
      throw new BadRequestException('Room capacity must be between 2 and 7 players.');
    }

    const roomId = `ROOM-${Math.floor(1000 + Math.random() * 9000)}`;
    const passage = await this.typingService.getRandomPassage(options.language || 'EN');

    const room: MultiplayerRoom = {
      roomId,
      name: options.name || `${hostUser.username}'s Race`,
      isPrivate: !!options.isPrivate,
      passcode: options.passcode,
      hostUserId: hostUser.userId,
      minPlayers: 2,
      maxPlayers: max,
      state: RoomState.WAITING,
      passage: {
        id: (passage as any)?._id?.toString() || 'passage_custom',
        title: passage.title,
        content: passage.content,
        wordCount: passage.wordCount,
        charCount: passage.content.length,
      },
      participants: new Map(),
      spectators: new Set(),
      countdownSeconds: 5,
      raceStartedAt: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      replaySnapshots: [],
    };

    this.rooms.set(roomId, room);
    await this.syncRoomToRedis(room);
    return room;
  }

  async getRoomOrHydrate(roomId: string, forceFresh: boolean = false): Promise<MultiplayerRoom | undefined> {
    let room = this.rooms.get(roomId);
    if ((!room || forceFresh) && this.redisService?.get) {
      try {
        const raw = await this.redisService.get(`keyrush:room:${roomId}`);
        if (raw) {
          const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (room) {
            // Update existing in-memory room without breaking object reference
            room.participants = new Map(parsed.participants || []);
            room.spectators = new Set(parsed.spectators || []);
          } else {
            room = {
              ...parsed,
              createdAt: new Date(parsed.createdAt || Date.now()),
              expiresAt: new Date(parsed.expiresAt || Date.now() + 3600000),
              participants: new Map(parsed.participants || []),
              spectators: new Set(parsed.spectators || []),
            };
            this.rooms.set(roomId, room);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not hydrate room ${roomId} from Redis: ${err.message}`);
      }
    }
    return room;
  }

  async getPublicRooms(): Promise<any[]> {
    const list: any[] = [];
    if (this.redisService?.smembers) {
      try {
        const activeIds = await this.redisService.smembers('keyrush:active_rooms');
        if (Array.isArray(activeIds)) {
          for (const id of activeIds) {
            await this.getRoomOrHydrate(id);
          }
        }
      } catch (e) {}
    }

    for (const [_, room] of this.rooms.entries()) {
      if (!room.isPrivate && room.state !== RoomState.FINISHED && room.state !== RoomState.CANCELLED) {
        list.push({
          roomId: room.roomId,
          name: room.name,
          hostUserId: room.hostUserId,
          playerCount: room.participants.size,
          minPlayers: room.minPlayers,
          maxPlayers: room.maxPlayers,
          state: room.state,
          language: room.passage.title.includes('বাঙলা') ? 'BN' : 'EN',
          spectatorCount: room.spectators.size,
        });
      }
    }
    return list;
  }

  getRoom(roomId: string): MultiplayerRoom | undefined {
    return this.rooms.get(roomId);
  }

  // Joins a player with boundary enforcement & Redis lock
  async joinRoom(
    roomId: string,
    user: { userId: string; username: string; roles: string[] },
    socketId: string,
    carId: string = 'car_cyber_phantom',
  ): Promise<{ room: MultiplayerRoom; participant: RoomParticipant }> {
    if (!user || user.roles.includes('GUEST')) {
      throw new ForbiddenException('Guest users cannot enter multiplayer rooms. Please register or log in.');
    }

    let room = await this.getRoomOrHydrate(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found.`);
    }

    if (room.state !== RoomState.WAITING && room.state !== RoomState.READY) {
      throw new BadRequestException('Cannot join: Race is already in progress or has concluded.');
    }

    // Check existing participant for lobby reconnection
    if (room.participants.has(user.userId)) {
      const existing = room.participants.get(user.userId)!;
      existing.socketId = socketId;
      existing.disconnectedAt = null;
      await this.syncRoomToRedis(room);
      return { room, participant: existing };
    }

    // Multi-room check
    const activeRoomId = (this.redisService?.get ? await this.redisService.get(`keyrush:lock:user:${user.userId}`) : null) || this.userActiveRoom.get(user.userId);
    if (activeRoomId && activeRoomId !== roomId) {
      const activeRoom = await this.getRoomOrHydrate(activeRoomId);
      if (activeRoom && (activeRoom.state === RoomState.IN_PROGRESS || activeRoom.state === RoomState.COUNTDOWN)) {
        throw new BadRequestException('Player is already in an active race in another room.');
      }
    }

    // Strict 2-7 capacity check
    if (room.participants.size >= room.maxPlayers) {
      throw new BadRequestException(`Room has reached maximum capacity of ${room.maxPlayers} players.`);
    }

    // Distributed room lock to prevent concurrent overflow past max capacity
    const lockKey = `keyrush:lock:room:${roomId}`;
    if (this.redisService?.acquireLock) {
      const locked = await this.redisService.acquireLock(lockKey, 3000);
      if (!locked && process.env.NODE_ENV === 'production') {
        throw new BadRequestException('Could not acquire room lock. Please try again.');
      }
    }

    try {
      // Re-hydrate within lock to get fresh participants from other instances
      const freshRoom = await this.getRoomOrHydrate(roomId, true);
      if (freshRoom) room = freshRoom;

      if (room.participants.size >= room.maxPlayers) {
        throw new BadRequestException(`Room has reached maximum capacity of ${room.maxPlayers} players.`);
      }

      const reconnectToken = crypto.randomBytes(16).toString('hex');
      const participant: RoomParticipant = {
        userId: user.userId,
        username: user.username,
        socketId,
        isGuest: false,
        isReady: false,
        carId,
        joinedAt: new Date(),
        reconnectToken,
        typedIndex: 0,
        errorCount: 0,
        rawInputCount: 0,
        streak: 0,
        nitroActive: false,
        nitroEndsAt: 0,
        progressPercent: 0,
        netWpm: 0,
        rawWpm: 0,
        accuracy: 100,
        speed: 20,
        rankPosition: 0,
        finished: false,
        finishTimeMs: 0,
        disconnectedAt: null,
        isFlaggedSuspicious: false,
        suspicionReason: '',
        lastWpm: 0,
        lastUpdateTimestamp: Date.now(),
        lastSequenceNumber: 0,
      };

      room.participants.set(user.userId, participant);
      this.userActiveRoom.set(user.userId, roomId);

      // Redis active player lock (10 minutes TTL)
      await this.redisService.set(`keyrush:lock:user:${user.userId}`, roomId, 600);
      await this.syncRoomToRedis(room);

      return { room, participant };
    } finally {
      await this.redisService.releaseLock(lockKey);
    }
  }

  async syncRoomToRedis(room: MultiplayerRoom) {
    if (!this.redisService?.set) return;
    try {
      const serializableRoom = {
        roomId: room.roomId,
        name: room.name,
        isPrivate: room.isPrivate,
        passcode: room.passcode,
        hostUserId: room.hostUserId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        state: room.state,
        passage: room.passage,
        participants: Array.from(room.participants.entries()),
        spectators: Array.from(room.spectators),
        countdownSeconds: room.countdownSeconds,
        raceStartedAt: room.raceStartedAt,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        replaySnapshots: room.replaySnapshots,
      };
      await this.redisService.set(`keyrush:room:${room.roomId}`, JSON.stringify(serializableRoom), 3600);
      if (this.redisService?.sadd) {
        await this.redisService.sadd('keyrush:active_rooms', room.roomId);
      }
    } catch (e: any) {
      this.logger.warn(`Could not sync room ${room.roomId} to Redis: ${e.message}`);
    }
  }

  // Handle Spectators (Observer pattern)
  addSpectator(roomId: string, socketId: string): MultiplayerRoom {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');
    room.spectators.add(socketId);
    return room;
  }

  removeSpectator(roomId: string, socketId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.spectators.delete(socketId);
    }
  }

  leaveRoom(roomId: string, userId: string): { room: MultiplayerRoom; remainingCount: number } {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');

    room.participants.delete(userId);
    this.userActiveRoom.delete(userId);
    this.redisService.del(`keyrush:lock:user:${userId}`).catch(() => { });

    if (room.hostUserId === userId && room.participants.size > 0) {
      const nextUser = room.participants.keys().next().value;
      if (nextUser) room.hostUserId = nextUser;
    }

    if (room.participants.size < 2 && room.state === RoomState.COUNTDOWN) {
      room.state = RoomState.WAITING;
      room.countdownSeconds = 5;
    }

    this.syncRoomToRedis(room).catch(() => {});
    return { room, remainingCount: room.participants.size };
  }

  // Disconnect Grace Period (15s)
  markPlayerDisconnected(roomId: string, userId: string): RoomParticipant | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const p = room.participants.get(userId);
    if (!p) return null;

    p.disconnectedAt = new Date();
    return p;
  }

  async reconnectPlayer(
    roomId: string,
    userId: string,
    reconnectToken: string,
    newSocketId: string,
  ): Promise<{ room: MultiplayerRoom; participant: RoomParticipant }> {
    let room = await this.getRoomOrHydrate(roomId, true);
    if (!room) throw new NotFoundException('Room not found');
    const p = room.participants.get(userId);
    if (!p) throw new NotFoundException('Player not in room');

    if (p.reconnectToken !== reconnectToken) {
      throw new ForbiddenException('Invalid reconnection token');
    }

    p.socketId = newSocketId;
    p.disconnectedAt = null;
    await this.syncRoomToRedis(room);
    return { room, participant: p };
  }

  setPlayerReady(roomId: string, userId: string, isReady: boolean): { room: MultiplayerRoom; canStart: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');

    const participant = room.participants.get(userId);
    if (!participant) throw new NotFoundException('Participant not found in room');

    participant.isReady = isReady;

    const participantCount = room.participants.size;
    const allReady = Array.from(room.participants.values()).every(p => p.isReady);
    const canStart = participantCount >= 2 && participantCount <= 7 && allReady;

    this.syncRoomToRedis(room).catch(() => {});
    return { room, canStart };
  }

  // Server-Authoritative Keystroke Update with Anti-Cheat Telemetry
  updatePlayerTyping(
    roomId: string,
    userId: string,
    telemetry: {
      textBuffer?: string;
      typedIndex?: number;
      errorCount?: number;
      rawInputCount?: number;
      sequenceNumber?: number;
      clientTimestamp?: number;
    },
  ): { participant: RoomParticipant; raceFinished: boolean } {
    const room = this.rooms.get(roomId);
    if (!room || room.state !== RoomState.IN_PROGRESS) {
      return { participant: null as any, raceFinished: false };
    }

    const p = room.participants.get(userId);
    if (!p || p.finished) {
      return { participant: p || (null as any), raceFinished: false };
    }

    // Sequence Monotonicity & Replay Protection
    if (telemetry.sequenceNumber !== undefined) {
      if (p.lastSequenceNumber !== undefined && telemetry.sequenceNumber <= p.lastSequenceNumber) {
        // Replayed packet or out-of-order drop: ignore duplicate
        return { participant: p, raceFinished: false };
      }
      p.lastSequenceNumber = telemetry.sequenceNumber;
    }

    const now = Date.now();
    const elapsedSeconds = room.raceStartedAt ? Math.max((now - room.raceStartedAt) / 1000, 0.5) : 0.5;

    const expectedText = (room.passage.content || '').normalize('NFC');
    const passageLength = expectedText.length;

    let correctChars = 0;
    let errors = 0;
    let rawInputs = 0;

    if (telemetry.textBuffer !== undefined) {
      // -------------------------------------------------------------
      // Server-Authoritative Character Matching against Official Passage
      // -------------------------------------------------------------
      const submitted = (telemetry.textBuffer || '').normalize('NFC');
      const minLen = Math.min(submitted.length, passageLength);

      for (let i = 0; i < minLen; i++) {
        if (submitted[i] === expectedText[i]) {
          correctChars++;
        } else {
          break; // First character divergence halts valid progression
        }
      }

      errors = Math.max(0, submitted.length - correctChars);
      rawInputs = Math.max(p.rawInputCount, submitted.length);
    } else {
      // If client attempts to advance without providing textBuffer,
      // strictly do NOT trust forged forward progress!
      correctChars = p.typedIndex;
      errors = p.errorCount;
      rawInputs = p.rawInputCount;
    }

    const indexAdvance = correctChars - p.typedIndex;
    if (indexAdvance > 0 && errors === 0) {
      p.streak += indexAdvance;
      if (p.streak >= 25 && !p.nitroActive) {
        p.nitroActive = true;
        p.nitroEndsAt = now + 3000;
      }
    } else if (errors > 0) {
      p.streak = 0;
    }

    if (p.nitroActive && now > p.nitroEndsAt) {
      p.nitroActive = false;
    }

    // Calculations computed 100% on the server
    const metrics = this.typingService.calculateMetrics(rawInputs, correctChars, elapsedSeconds);
    const speed = this.racingService.calculateVehicleSpeed(metrics.netWpm, metrics.accuracy, p.nitroActive);
    const progressPercent = Number(((correctChars / passageLength) * 100).toFixed(1));

    // Anti-Cheat Anomaly Check (Cadence & Acceleration)
    const timeDeltaSeconds = Math.max((now - p.lastUpdateTimestamp) / 1000, 0.05);
    const wpmDelta = Math.abs(metrics.netWpm - p.lastWpm) / timeDeltaSeconds;
    const anomaly = this.aiService.analyzeTelemetryAnomaly({
      rawWpm: metrics.rawWpm,
      netWpm: metrics.netWpm,
      accuracy: metrics.accuracy,
      wpmDelta,
    });

    if (anomaly.isSuspicious && !p.isFlaggedSuspicious) {
      p.isFlaggedSuspicious = true;
      p.suspicionReason = anomaly.reason;
      this.logger.warn(`[Anti-Cheat Flag] User ${p.username} in room ${roomId}: ${anomaly.reason}`);
    }

    p.lastWpm = metrics.netWpm;
    p.lastUpdateTimestamp = now;

    p.typedIndex = correctChars;
    p.errorCount = errors;
    p.rawInputCount = rawInputs;
    p.rawWpm = metrics.rawWpm;
    p.netWpm = metrics.netWpm;
    p.accuracy = metrics.accuracy;
    p.speed = speed;
    p.progressPercent = Math.min(progressPercent, 100);

    // Only allow finishing if ALL characters match the official passage
    if (correctChars >= passageLength && !p.finished) {
      p.finished = true;
      p.finishTimeMs = now - (room.raceStartedAt || now);
      p.progressPercent = 100;
    }

    // Rank positions
    const sorted = Array.from(room.participants.values()).sort((a, b) => {
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progressPercent - a.progressPercent;
    });

    sorted.forEach((participant, idx) => {
      participant.rankPosition = idx + 1;
    });

    // Record periodic replay snapshot (1 per second max)
    const timeMs = room.raceStartedAt ? now - room.raceStartedAt : 0;
    const lastSnapshot = room.replaySnapshots[room.replaySnapshots.length - 1];
    if (!lastSnapshot || timeMs - lastSnapshot.timeMs >= 800) {
      room.replaySnapshots.push({
        timeMs,
        positions: Array.from(room.participants.values()).map(part => ({
          userId: part.userId,
          progress: part.progressPercent,
          wpm: part.netWpm,
          speed: part.speed,
        })),
      });
    }

    const allFinished = Array.from(room.participants.values()).every(part => part.finished);
    if (allFinished) {
      room.state = RoomState.FINISHED;
      this.persistFinishedRace(room);
    }

    this.syncRoomToRedis(room).catch(() => {});
    return { participant: p, raceFinished: allFinished };
  }

  // Persists finished race to MongoDB
  private async persistFinishedRace(room: MultiplayerRoom) {
    try {
      const participants = Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        carId: p.carId,
        rankPosition: p.rankPosition,
        netWpm: p.netWpm,
        rawWpm: p.rawWpm,
        accuracy: p.accuracy,
        finishTimeMs: p.finishTimeMs,
        isFlaggedSuspicious: p.isFlaggedSuspicious,
        suspicionReason: p.suspicionReason,
      }));

      const winner = participants.find(p => p.rankPosition === 1);

      await this.racingService.persistRaceResult({
        roomId: room.roomId,
        passageId: room.passage.id,
        passageTitle: room.passage.title,
        language: room.passage.title.includes('বাঙলা') ? 'BN' : 'EN',
        participants,
        winnerUserId: winner?.userId,
        raceStartedAt: room.raceStartedAt || Date.now(),
        raceFinishedAt: Date.now(),
        replaySnapshots: room.replaySnapshots,
      });

      // Release player locks and active room index
      if (this.redisService?.srem) {
        this.redisService.srem('keyrush:active_rooms', room.roomId).catch(() => {});
      }
      for (const p of participants) {
        this.userActiveRoom.delete(p.userId);
        this.redisService.del(`keyrush:lock:user:${p.userId}`).catch(() => { });
      }
    } catch (err: any) {
      this.logger.error(`Error saving finished race ${room.roomId}: ${err.message}`);
    }
  }
}
