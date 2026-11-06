import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { RedisService } from '../common/redis/redis.service';

@Module({
  controllers: [HealthController],
  providers: [RedisService],
  exports: [RedisService],
})
export class HealthModule {}
