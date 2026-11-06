import { HealthController } from '../src/health/health.controller';
import { RedisService } from '../src/common/redis/redis.service';

describe('Production Readiness: Health Check & Redis Resilience', () => {
  let healthController: HealthController;
  let redisService: RedisService;

  beforeEach(() => {
    redisService = new RedisService();
    // Simulate init in fallback mode without external Redis server
    redisService.onModuleInit();

    const mockConnection: any = {
      readyState: 1, // 1 = connected
    };

    healthController = new HealthController(mockConnection, redisService);
  });

  afterEach(() => {
    redisService.onModuleDestroy();
  });

  it('Health Check returns UP status, database CONNECTED, and game limits metadata', () => {
    const health = healthController.checkRootHealth();

    expect(health.status).toBe('UP');
    expect(health.database.status).toBe('CONNECTED');
    expect(health.redis).toBeDefined();
    expect(health.limits.multiplayerRoomMin).toBe(2);
    expect(health.limits.multiplayerRoomMax).toBe(7);
    expect(health.limits.eventParticipantsMin).toBe(20);
    expect(health.limits.eventParticipantsMax).toBe(300);
  });

  it('RedisService operates seamlessly with in-memory caching when Redis is offline', async () => {
    await redisService.set('room:test_1', JSON.stringify({ roomId: 'test_1', players: 4 }), 60);
    const value = await redisService.get('room:test_1');

    expect(value).not.toBeNull();
    const parsed = JSON.parse(value!);
    expect(parsed.roomId).toBe('test_1');
    expect(parsed.players).toBe(4);

    await redisService.del('room:test_1');
    const deleted = await redisService.get('room:test_1');
    expect(deleted).toBeNull();
  });
});
