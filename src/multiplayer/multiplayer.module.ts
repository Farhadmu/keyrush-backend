import { Module } from '@nestjs/common';
import { MultiplayerGateway } from './multiplayer.gateway';
import { MultiplayerController } from './multiplayer.controller';
import { RoomManager } from './room.manager';
import { AuthModule } from '../auth/auth.module';
import { TypingModule } from '../typing/typing.module';
import { RacingModule } from '../racing/racing.module';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [AuthModule, TypingModule, RacingModule, UsersModule],
  controllers: [MultiplayerController],
  providers: [MultiplayerGateway, RoomManager],
  exports: [RoomManager],
})
export class MultiplayerModule {}
