import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventHeatsService } from './event-heats.service';
import { EventHeatsController } from './event-heats.controller';
import { EventHeat, EventHeatSchema } from './schemas/heat.schema';
import { Competition, CompetitionSchema } from '../competitions/schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationSchema } from '../competitions/schemas/registration.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: EventHeat.name, schema: EventHeatSchema },
      { name: Competition.name, schema: CompetitionSchema },
      { name: CompetitionRegistration.name, schema: CompetitionRegistrationSchema },
    ]),
  ],
  controllers: [EventHeatsController],
  providers: [EventHeatsService],
  exports: [EventHeatsService],
})
export class EventHeatsModule {}
