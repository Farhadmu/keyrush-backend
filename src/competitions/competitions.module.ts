import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CompetitionsService } from './competitions.service';
import { CompetitionsController } from './competitions.controller';
import { Competition, CompetitionSchema } from './schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationSchema } from './schemas/registration.schema';
import { TournamentMatch, TournamentMatchSchema } from './schemas/tournament-match.schema';
import { Certificate, CertificateSchema } from './schemas/certificate.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Competition.name, schema: CompetitionSchema },
      { name: CompetitionRegistration.name, schema: CompetitionRegistrationSchema },
      { name: TournamentMatch.name, schema: TournamentMatchSchema },
      { name: Certificate.name, schema: CertificateSchema },
    ]),
  ],
  controllers: [CompetitionsController],
  providers: [CompetitionsService],
  exports: [CompetitionsService],
})
export class CompetitionsModule {}
