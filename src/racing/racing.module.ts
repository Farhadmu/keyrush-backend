import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RacingService } from './racing.service';
import { RacingController } from './racing.controller';
import { RaceResult, RaceResultSchema } from './schemas/race-result.schema';
import { Profile, ProfileSchema } from '../users/schemas/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: RaceResult.name, schema: RaceResultSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [RacingController],
  providers: [RacingService],
  exports: [RacingService],
})
export class RacingModule {}
