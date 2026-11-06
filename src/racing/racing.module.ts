import { Module } from '@nestjs/common';
import { RacingService } from './racing.service';
import { RacingController } from './racing.controller';

@Module({
  controllers: [RacingController],
  providers: [RacingService],
  exports: [RacingService],
})
export class RacingModule {}
