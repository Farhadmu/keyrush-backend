import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TypingService } from '../typing/typing.service';
import { RacingService } from '../racing/racing.service';

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
  countdownSeconds: number;
  raceStartedAt: number | null;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class RoomManager {
  // In-memory room store (can be synchronized with Redis in cluster mode)
  private rooms: Map<string, MultiplayerRoom> = new Map();
  // Map of active user -> roomId to prevent simultaneous multi-room participation
  private userActiveRoom: Map<string, string> = new Map();

  constructor(
    private readonly typingService: TypingService,
    private readonly racingService: RacingService,
  ) {
    this.seedDefaultPublicRooms();
  }

  private async seedDefaultPublicRooms() {
    // Seed an initial open public lobby so players can immediately quick match or join
    const passage = await this.typingService.getRandomPassage('EN');
    const roomId = 'ROOM-NEON-1';
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
        title: passage.title,
        content: passage.content,
        wordCount: passage.wordCount,
        charCount: passage.content.length,
      },
      participants: new Map(),
      countdownSeconds: 5,
      raceStartedAt: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
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
    // Rule 3.1: Only registered and authenticated accounts can participate
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

    // Enforce 2-7 capacity rule
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
      countdownSeconds: 5,
      raceStartedAt: null,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };

    this.rooms.set(roomId, room);
    return room;
  }

  getPublicRooms(): any[] {
    const list: any[] = [];
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
        });
      }
    }
    return list;
  }

  getRoom(roomId: string): MultiplayerRoom | undefined {
    return this.rooms.get(roomId);
  }

  // Joins a player to a room with all mandatory boundary checks
  joinRoom(
    roomId: string,
    user: { userId: string; username: string; roles: string[] },
    socketId: string,
    carId: string = 'car_cyber_phantom',
  ): { room: MultiplayerRoom; participant: RoomParticipant } {
    // Rule 3.1: Guest users cannot enter multiplayer rooms
    if (!user || user.roles.includes('GUEST')) {
      throw new ForbiddenException('Guest users cannot enter multiplayer rooms. Please register or log in.');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      throw new NotFoundException(`Room ${roomId} not found.`);
    }

    // Disallow joining if race already started or finished
    if (room.state !== RoomState.WAITING && room.state !== RoomState.READY) {
      throw new BadRequestException('Cannot join: Race is already in progress or has concluded.');
    }

    // Check if player is already in this room
    if (room.participants.has(user.userId)) {
      // Re-link socket if reconnecting in lobby
      const existing = room.participants.get(user.userId)!;
      existing.socketId = socketId;
      existing.disconnectedAt = null;
      return { room, participant: existing };
    }

    // Check if player is participating in another active race
    const currentRoomId = this.userActiveRoom.get(user.userId);
    if (currentRoomId && currentRoomId !== roomId) {
      const activeRoom = this.rooms.get(currentRoomId);
      if (activeRoom && activeRoom.state === RoomState.IN_PROGRESS) {
        throw new BadRequestException('Player is already in an active race in another room.');
      }
    }

    // Rule 3.1: Maximum players is strictly 7 (or room.maxPlayers)
    if (room.participants.size >= room.maxPlayers) {
      throw new BadRequestException(`Room has reached maximum capacity of ${room.maxPlayers} players.`);
    }

    const participant: RoomParticipant = {
      userId: user.userId,
      username: user.username,
      socketId,
      isGuest: false,
      isReady: false,
      carId,
      joinedAt: new Date(),
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
    };

    room.participants.set(user.userId, participant);
    this.userActiveRoom.set(user.userId, roomId);

    return { room, participant };
  }

  leaveRoom(roomId: string, userId: string): { room: MultiplayerRoom; remainingCount: number } {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');

    room.participants.delete(userId);
    this.userActiveRoom.delete(userId);

    // If host leaves and others remain, assign new host
    if (room.hostUserId === userId && room.participants.size > 0) {
      const nextUser = room.participants.keys().next().value;
      if (nextUser) room.hostUserId = nextUser;
    }

    // If room drops below 2 players while in COUNTDOWN, revert to WAITING
    if (room.participants.size < 2 && room.state === RoomState.COUNTDOWN) {
      room.state = RoomState.WAITING;
      room.countdownSeconds = 5;
    }

    return { room, remainingCount: room.participants.size };
  }

  setPlayerReady(roomId: string, userId: string, isReady: boolean): { room: MultiplayerRoom; canStart: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) throw new NotFoundException('Room not found');

    const participant = room.participants.get(userId);
    if (!participant) throw new NotFoundException('Participant not found in room');

    participant.isReady = isReady;

    // Rule 3.1: The race cannot start with fewer than two players
    const participantCount = room.participants.size;
    const allReady = Array.from(room.participants.values()).every(p => p.isReady);
    const canStart = participantCount >= 2 && participantCount <= 7 && allReady;

    return { room, canStart };
  }

  // Server-authoritative keystroke update
  updatePlayerTyping(
    roomId: string,
    userId: string,
    telemetry: {
      typedIndex: number;
      errorCount: number;
      rawInputCount: number;
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

    const now = Date.now();
    const elapsedSeconds = room.raceStartedAt ? Math.max((now - room.raceStartedAt) / 1000, 0.1) : 0.1;

    // Validate index boundaries
    const passageLength = room.passage.charCount;
    const safeTypedIndex = Math.min(Math.max(telemetry.typedIndex, p.typedIndex), passageLength);
    const errors = Math.max(telemetry.errorCount, p.errorCount);
    const rawInputs = Math.max(telemetry.rawInputCount, safeTypedIndex + errors);

    // Calculate Streak & Nitro
    const indexAdvance = safeTypedIndex - p.typedIndex;
    if (indexAdvance > 0 && errors === p.errorCount) {
      p.streak += indexAdvance;
      // Trigger Nitro boost on streak >= 25
      if (p.streak >= 25 && !p.nitroActive) {
        p.nitroActive = true;
        p.nitroEndsAt = now + 3000; // 3-second nitro
      }
    } else if (errors > p.errorCount) {
      p.streak = 0; // reset streak on error
    }

    // Check if nitro expired
    if (p.nitroActive && now > p.nitroEndsAt) {
      p.nitroActive = false;
    }

    // Authoritative metrics
    const metrics = this.typingService.calculateMetrics(rawInputs, safeTypedIndex, elapsedSeconds);
    const speed = this.racingService.calculateVehicleSpeed(metrics.netWpm, metrics.accuracy, p.nitroActive);
    const progressPercent = Number(((safeTypedIndex / passageLength) * 100).toFixed(1));

    p.typedIndex = safeTypedIndex;
    p.errorCount = errors;
    p.rawInputCount = rawInputs;
    p.rawWpm = metrics.rawWpm;
    p.netWpm = metrics.netWpm;
    p.accuracy = metrics.accuracy;
    p.speed = speed;
    p.progressPercent = Math.min(progressPercent, 100);

    // Check for finish
    if (safeTypedIndex >= passageLength && !p.finished) {
      p.finished = true;
      p.finishTimeMs = now - (room.raceStartedAt || now);
      p.progressPercent = 100;
    }

    // Update real-time rank positions
    const sorted = Array.from(room.participants.values()).sort((a, b) => {
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progressPercent - a.progressPercent;
    });

    sorted.forEach((participant, idx) => {
      participant.rankPosition = idx + 1;
    });

    // Check if all players finished
    const allFinished = Array.from(room.participants.values()).every(part => part.finished);
    if (allFinished) {
      room.state = RoomState.FINISHED;
    }

    return { participant: p, raceFinished: allFinished };
  }
}
