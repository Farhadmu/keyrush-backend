import { Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from './common/database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TypingModule } from './typing/typing.module';
import { RacingModule } from './racing/racing.module';
import { MultiplayerModule } from './multiplayer/multiplayer.module';
import { CompetitionsModule } from './competitions/competitions.module';
import { EventHeatsModule } from './event-heats/event-heats.module';
import { OrganizationsModule } from './organizations/organizations.module';
import { LeaderboardsModule } from './leaderboards/leaderboards.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '180', 10),
      },
    ]),
    DatabaseModule,
    HealthModule,
    AuthModule,
    UsersModule,
    TypingModule,
    RacingModule,
    MultiplayerModule,
    CompetitionsModule,
    EventHeatsModule,
    OrganizationsModule,
    LeaderboardsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
