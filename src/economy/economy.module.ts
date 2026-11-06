import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EconomyService } from './economy.service';
import { EconomyController } from './economy.controller';
import { BattlePass, BattlePassSchema } from './schemas/battle-pass.schema';
import { Profile, ProfileSchema } from '../users/schemas/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: BattlePass.name, schema: BattlePassSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [EconomyController],
  providers: [EconomyService],
  exports: [EconomyService],
})
export class EconomyModule {}

