import { RoomManager, RoomState } from '../src/multiplayer/room.manager';
import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';
import { RedisService } from '../src/common/redis/redis.service';
import { AiService } from '../src/common/ai/ai.service';

describe('Adversarial Anti-Cheat & Telemetry Verification', () => {
  let roomManager: RoomManager;
  let typingService: TypingService;
  let racingService: RacingService;
  let redisService: RedisService;
  let aiService: AiService;

  beforeEach(async () => {
    const testPassage = {
      _id: 'pass_123',
      title: 'Official Test Passage',
      content: 'The quick brown fox jumps over the lazy dog.',
      wordCount: 9,
      charCount: 44,
      language: 'EN',
      difficulty: 'MEDIUM',
    };
    const passageModelMock: any = {
      countDocuments: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockReturnValue({
        skip: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(testPassage),
        }),
        exec: jest.fn().mockResolvedValue(testPassage),
      }),
      insertMany: jest.fn(),
    };
    const typingResultMock: any = {};
    const profileModelMock: any = {};
    const raceResultMock: any = {};

    typingService = new TypingService(passageModelMock, typingResultMock, profileModelMock);
    racingService = new RacingService(raceResultMock, profileModelMock);
    redisService = new RedisService();
    redisService.onModuleInit();

    const aiAnalysisModelMock: any = function (data: any) {
      return { save: jest.fn().mockResolvedValue(data) };
    };
    aiService = new AiService(aiAnalysisModelMock as any);

    roomManager = new RoomManager(typingService, racingService, redisService, aiService);
  });

  it('ADVERSARIAL: Cheating client attempts to forge 100% progress without sending typed characters', async () => {
    const hostUser = { userId: 'racer_1', username: 'SpeedDemon', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { name: 'AntiCheat Arena', maxPlayers: 4 });

    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');
    const player2 = { userId: 'racer_2', username: 'HonestRacer', roles: ['PLAYER'] };
    await roomManager.joinRoom(room.roomId, player2, 'sock_2');

    // Transition room to IN_PROGRESS
    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 5000;

    // Cheater sends false typedIndex and 0 errors, but NO textBuffer
    const forgedTelemetry = {
      typedIndex: 44,
      errorCount: 0,
      rawInputCount: 44,
      sequenceNumber: 1,
    };

    const { participant } = roomManager.updatePlayerTyping(room.roomId, 'racer_1', forgedTelemetry);

    // Server must reject the forged advance and keep typedIndex at 0
    expect(participant.typedIndex).toBe(0);
    expect(participant.progressPercent).toBe(0);
    expect(participant.finished).toBe(false);
  });

  it('ADVERSARIAL: Cheater sends gibberish characters attempting to fake speed', async () => {
    const hostUser = { userId: 'racer_1', username: 'SpeedDemon', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 2000;

    // Passage is: "The quick brown fox jumps over the lazy dog."
    // Cheater sends: "The zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz" (mismatches after "The ")
    const maliciousBuffer = {
      textBuffer: 'The zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      sequenceNumber: 1,
      clientTimestamp: Date.now(),
    };

    const { participant } = roomManager.updatePlayerTyping(room.roomId, 'racer_1', maliciousBuffer);

    // Server should only award the 4 matching characters ("The ")
    expect(participant.typedIndex).toBe(4);
    expect(participant.errorCount).toBe(maliciousBuffer.textBuffer.length - 4);
    expect(participant.finished).toBe(false);
    expect(participant.progressPercent).toBeLessThan(15);
  });

  it('ADVERSARIAL: Replay attack with duplicate or descending sequence numbers is ignored', async () => {
    const hostUser = { userId: 'racer_1', username: 'SpeedDemon', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 3000;

    // Packet 1: sequence 5
    const packet1 = {
      textBuffer: 'The quick',
      sequenceNumber: 5,
      clientTimestamp: Date.now(),
    };
    const res1 = roomManager.updatePlayerTyping(room.roomId, 'racer_1', packet1);
    expect(res1.participant.typedIndex).toBe(9);

    // Packet 2: Replayed packet 5 (same sequence number)
    const replayedPacket = {
      textBuffer: 'The quick brown',
      sequenceNumber: 5, // Duplicate sequence!
      clientTimestamp: Date.now(),
    };
    const res2 = roomManager.updatePlayerTyping(room.roomId, 'racer_1', replayedPacket);

    // Must be dropped without updating to 'The quick brown'
    expect(res2.participant.typedIndex).toBe(9);

    // Packet 3: Out-of-order packet (sequence 3 < 5)
    const outOfOrderPacket = {
      textBuffer: 'The quick brown fox',
      sequenceNumber: 3,
      clientTimestamp: Date.now(),
    };
    const res3 = roomManager.updatePlayerTyping(room.roomId, 'racer_1', outOfOrderPacket);
    expect(res3.participant.typedIndex).toBe(9);
  });

  it('ADVERSARIAL: Legitimate racer typing all characters accurately completes race', async () => {
    const hostUser = { userId: 'racer_1', username: 'HonestMaster', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 10000; // 10 seconds ago

    const fullPassage = 'The quick brown fox jumps over the lazy dog.';
    const finalPacket = {
      textBuffer: fullPassage,
      sequenceNumber: 1,
      clientTimestamp: Date.now(),
    };

    const { participant } = roomManager.updatePlayerTyping(room.roomId, 'racer_1', finalPacket);

    expect(participant.typedIndex).toBe(fullPassage.length);
    expect(participant.errorCount).toBe(0);
    expect(participant.progressPercent).toBe(100);
    expect(participant.finished).toBe(true);
    expect(participant.finishTimeMs).toBeGreaterThan(0);
    expect(participant.accuracy).toBe(100);
  });

  it('ADVERSARIAL: Reconnection cannot restore forged progress and maintains exact server state', async () => {
    const hostUser = { userId: 'racer_reconn', username: 'ReconnectTester', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    const { participant: p1 } = await roomManager.joinRoom(room.roomId, hostUser, 'sock_orig');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 5000;

    // Type 9 characters legitimately ("The quick")
    roomManager.updatePlayerTyping(room.roomId, 'racer_reconn', {
      textBuffer: 'The quick',
      sequenceNumber: 1,
      clientTimestamp: Date.now(),
    });

    expect(p1.typedIndex).toBe(9);

    // Racer disconnects
    roomManager.markPlayerDisconnected(room.roomId, 'racer_reconn');

    // Racer reconnects with token - reconnect does not accept client-provided progress
    const { participant: restored } = await roomManager.reconnectPlayer(
      room.roomId,
      'racer_reconn',
      p1.reconnectToken,
      'sock_new',
    );

    // Typed index must remain exactly 9 as persisted on the server
    expect(restored.typedIndex).toBe(9);
    expect(restored.socketId).toBe('sock_new');
    expect(restored.disconnectedAt).toBeNull();
  });

  it('RECOVERY: Dropped packet recovery via monotonic sequence number and cumulative buffer', async () => {
    const hostUser = { userId: 'racer_drop', username: 'PacketDropTester', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 4000;

    // Packet 1 (sequence 1): "The "
    const res1 = roomManager.updatePlayerTyping(room.roomId, 'racer_drop', {
      textBuffer: 'The ',
      sequenceNumber: 1,
    });
    expect(res1.participant.typedIndex).toBe(4);

    // Packet 2 (sequence 2) is DROPPED in transit over the network.
    // Packet 3 (sequence 3) arrives with cumulative buffer "The quick brown "
    const res3 = roomManager.updatePlayerTyping(room.roomId, 'racer_drop', {
      textBuffer: 'The quick brown ',
      sequenceNumber: 3,
    });

    // Monotonic advance immediately catches up to 16 characters
    expect(res3.participant.typedIndex).toBe(16);
    expect(res3.participant.errorCount).toBe(0);
  });

  it('ANTI-CHEAT: Speed anomaly flags telemetry for human review without automatically banning or kicking player', async () => {
    const hostUser = { userId: 'racer_bot', username: 'SpeedDemonBot', roles: ['PLAYER'] };
    const room = await roomManager.createRoom(hostUser, { maxPlayers: 2 });
    await roomManager.joinRoom(room.roomId, hostUser, 'sock_1');

    room.state = RoomState.IN_PROGRESS;
    room.raceStartedAt = Date.now() - 1000;

    // Instant typing burst triggering anomaly detector (> 240 WPM / extreme jump)
    const { participant } = roomManager.updatePlayerTyping(room.roomId, 'racer_bot', {
      textBuffer: 'The quick brown fox jumps over the lazy dog.',
      sequenceNumber: 1,
    });

    // Must be flagged as suspicious in telemetry
    expect(participant.isFlaggedSuspicious).toBe(true);
    expect(participant.suspicionReason).toBeDefined();

    // Player is NOT banned or kicked; race continues for human review
    expect(participant.finished).toBe(true);
    expect(room.participants.has('racer_bot')).toBe(true);
  });
});

