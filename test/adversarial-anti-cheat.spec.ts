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
});

