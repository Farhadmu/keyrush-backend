import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { RedisService } from '../common/redis/redis.service';

@Controller()
export class HealthController {
  private readonly startTime = Date.now();

  constructor(
    @InjectConnection() private connection: Connection,
    private redisService: RedisService,
  ) {}

  @Get('health')
  checkRootHealth() {
    return this.getHealthStatus();
  }

  @Get('api/v1/health')
  checkApiHealth() {
    return this.getHealthStatus();
  }

  private getHealthStatus() {
    const isDbConnected = this.connection?.readyState === 1;
    const redisStatus = this.redisService.getStatus();

    return {
      status: 'UP',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Number(((Date.now() - this.startTime) / 1000).toFixed(1)),
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
      database: {
        name: 'MongoDB',
        status: isDbConnected ? 'CONNECTED' : this.connection?.readyState === 2 ? 'CONNECTING' : 'DISCONNECTED',
      },
      redis: redisStatus,
      limits: {
        multiplayerRoomMin: 2,
        multiplayerRoomMax: 7,
        eventParticipantsMin: 20,
        eventParticipantsMax: 300,
      },
    };
  }
}
