import { RoomManager, RoomState } from '../src/multiplayer/room.manager';
import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';
import { RedisService } from '../src/common/redis/redis.service';
import { AiService } from '../src/common/ai/ai.service';
import { BadRequestException } from '@nestjs/common';

describe('Multi-Instance Distributed Multiplayer & Redis State Persistence', () => {
  let instanceA: RoomManager;
  let instanceB: RoomManager;
  let sharedRedisService: RedisService;
  let typingService: TypingService;
  let racingService: RacingService;
  let aiService: AiService;

  beforeEach(() => {
    sharedRedisService = new RedisService();
    sharedRedisService.onModuleInit();

    const passageMock = {
      _id: 'pass_multi',
      title: 'Neon Velocity Multi-Instance',
      content: 'Digital speed synchronization across distributed nodes.',
      wordCount: 7,
      charCount: 56,
      language: 'EN',
    };

    const passageModelMock: any = {
      countDocuments: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(passageMock) }),
        exec: jest.fn().mockResolvedValue(passageMock),
      }),
      insertMany: jest.fn(),
    };

    typingService = new TypingService(passageModelMock, {} as any, {} as any);
    racingService = new RacingService({} as any, {} as any);
    aiService = new AiService(function (d: any) { return { save: jest.fn().mockResolvedValue(d) }; } as any);

    // Two independent backend server instances connected to the SAME Redis service
    instanceA = new RoomManager(typingService, racingService, sharedRedisService, aiService);
    instanceB = new RoomManager(typingService, racingService, sharedRedisService, aiService);
  });

  it('Consistent Room State: Instance B hydrates and sees room created on Instance A via Redis', async () => {
    const hostUser = { userId: 'host_node1', username: 'HostNode1', roles: ['PLAYER'] };
    const roomA = await instanceA.createRoom(hostUser, { name: 'Inter-Node Arena', maxPlayers: 7 });

    expect(roomA.roomId).toBeDefined();

    // Instance B has empty local memory for this room initially
    expect(instanceB.getRoom(roomA.roomId)).toBeUndefined();

    // User joins via Instance B
    const user2 = { userId: 'user_node2', username: 'Node2Racer', roles: ['PLAYER'] };
    const { room: roomB, participant } = await instanceB.joinRoom(roomA.roomId, user2, 'sock_node2');

    expect(roomB.roomId).toBe(roomA.roomId);
    expect(roomB.name).toBe('Inter-Node Arena');
    expect(participant.userId).toBe('user_node2');
    expect(roomB.participants.has('user_node2')).toBe(true);

    // Verify room state is persisted into shared Redis
    const redisRoomRaw = await sharedRedisService.get(`keyrush:room:${roomA.roomId}`);
    expect(redisRoomRaw).toBeDefined();
    const parsedRedisRoom = JSON.parse(redisRoomRaw);
    expect(parsedRedisRoom.roomId).toBe(roomA.roomId);
    expect(parsedRedisRoom.participants.length).toBe(1);
  });

  it('Capacity Ceiling: 8th participant rejected across multi-instance concurrent joins', async () => {
    const hostUser = { userId: 'host_cap', username: 'HostCap', roles: ['PLAYER'] };
    const room = await instanceA.createRoom(hostUser, { maxPlayers: 7 });

    // Join 7 players alternating between Instance A and Instance B
    for (let i = 1; i <= 7; i++) {
      const user = { userId: `player_${i}`, username: `Racer_${i}`, roles: ['PLAYER'] };
      const targetInstance = i % 2 === 1 ? instanceA : instanceB;
      await targetInstance.joinRoom(room.roomId, user, `sock_${i}`);
    }

    // Verify room has exactly 7 players in Redis
    const redisRoomRaw = await sharedRedisService.get(`keyrush:room:${room.roomId}`);
    const parsed = JSON.parse(redisRoomRaw);
    expect(parsed.participants.length).toBe(7);

    // 8th participant joins on Instance B -> MUST be rejected
    const player8 = { userId: 'player_8', username: 'OverflowRacer', roles: ['PLAYER'] };
    await expect(
      instanceB.joinRoom(room.roomId, player8, 'sock_8'),
    ).rejects.toThrow(BadRequestException);
  });

  it('Cross-Instance Multi-Room Prevention: Player in active race on Instance A cannot join another room on Instance B', async () => {
    const host1 = { userId: 'host_r1', username: 'HostR1', roles: ['PLAYER'] };
    const room1 = await instanceA.createRoom(host1, { name: 'Active Room 1', maxPlayers: 4 });
    const racer = { userId: 'busy_racer', username: 'BusyRacer', roles: ['PLAYER'] };
    await instanceA.joinRoom(room1.roomId, racer, 'sock_r1');

    // Room 1 starts race
    room1.state = RoomState.IN_PROGRESS;
    room1.raceStartedAt = Date.now();
    await instanceA.syncRoomToRedis(room1);

    // Create Room 2 on Instance B
    const host2 = { userId: 'host_r2', username: 'HostR2', roles: ['PLAYER'] };
    const room2 = await instanceB.createRoom(host2, { name: 'Active Room 2', maxPlayers: 4 });

    // Same racer attempts to join Room 2 on Instance B
    await expect(
      instanceB.joinRoom(room2.roomId, racer, 'sock_r2'),
    ).rejects.toThrow(BadRequestException);
  });

  it('Cross-Instance Reconnect: Disconnect on Instance A and reconnect on Instance B preserves slot', async () => {
    const host = { userId: 'host_rec', username: 'HostRec', roles: ['PLAYER'] };
    const room = await instanceA.createRoom(host, { maxPlayers: 4 });
    const racer = { userId: 'traveler', username: 'Traveler', roles: ['PLAYER'] };

    const { participant: joinedPart } = await instanceA.joinRoom(room.roomId, racer, 'sock_instA');
    const token = joinedPart.reconnectToken;

    // Disconnect on Instance A
    instanceA.markPlayerDisconnected(room.roomId, 'traveler');

    // Reconnect on Instance B using token and new socket
    const { room: recRoom, participant: recPart } = await instanceB.reconnectPlayer(
      room.roomId,
      'traveler',
      token,
      'sock_instB',
    );

    expect(recPart.userId).toBe('traveler');
    expect(recPart.socketId).toBe('sock_instB');
    expect(recPart.disconnectedAt).toBeNull();
    expect(recRoom.participants.size).toBe(1);
  });

  it('Server Crash & Restart: New Instance C recovers active room state from Redis without data loss', async () => {
    const host = { userId: 'host_survivor', username: 'HostSurvivor', roles: ['PLAYER'] };
    const room = await instanceA.createRoom(host, { name: 'Resilient Race', maxPlayers: 5 });
    const racer = { userId: 'racer_persisted', username: 'PersistentRacer', roles: ['PLAYER'] };
    await instanceA.joinRoom(room.roomId, racer, 'sock_orig');

    // Simulate Instance A termination (garbage collected / container restarted)
    (instanceA as any) = null;

    // Instance C starts fresh with empty memory
    const instanceC = new RoomManager(typingService, racingService, sharedRedisService, aiService);

    // Instance C hydrates room from Redis
    const recoveredRoom = await instanceC.getRoomOrHydrate(room.roomId);

    expect(recoveredRoom).toBeDefined();
    expect(recoveredRoom!.roomId).toBe(room.roomId);
    expect(recoveredRoom!.name).toBe('Resilient Race');
    expect(recoveredRoom!.participants.has('racer_persisted')).toBe(true);
    expect(recoveredRoom!.participants.get('racer_persisted')!.username).toBe('PersistentRacer');
  });

  it('Redis Lock Failure: Production fails safely on lock contention', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const failingRedis: any = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined),
        acquireLock: jest.fn().mockResolvedValue(false), // Lock failure!
        releaseLock: jest.fn().mockResolvedValue(true),
      };

      const failingInstance = new RoomManager(typingService, racingService, failingRedis, aiService);
      const host = { userId: 'host_fail', username: 'HostFail', roles: ['PLAYER'] };
      const room = await failingInstance.createRoom(host, { maxPlayers: 4 });

      const racer = { userId: 'unlucky_racer', username: 'UnluckyRacer', roles: ['PLAYER'] };
      await expect(
        failingInstance.joinRoom(room.roomId, racer, 'sock_fail'),
      ).rejects.toThrow(BadRequestException);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

