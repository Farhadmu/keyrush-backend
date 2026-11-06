import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { RoomManager } from './room.manager';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('multiplayer')
export class MultiplayerController {
  constructor(private readonly roomManager: RoomManager) {}

  @Get('rooms')
  getPublicRooms() {
    return this.roomManager.getPublicRooms();
  }

  @Get('rooms/:id')
  getRoom(@Param('id') id: string) {
    const room = this.roomManager.getRoom(id);
    if (!room) return null;
    return {
      roomId: room.roomId,
      name: room.name,
      hostUserId: room.hostUserId,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      state: room.state,
      playerCount: room.participants.size,
      participants: Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        carId: p.carId,
        isReady: p.isReady,
      })),
      passage: room.passage,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('rooms')
  async createRoom(
    @CurrentUser() user: any,
    @Body()
    body: {
      name?: string;
      isPrivate?: boolean;
      passcode?: string;
      maxPlayers?: number;
      language?: string;
    },
  ) {
    const room = await this.roomManager.createRoom(
      { userId: user.userId, username: user.username, roles: user.roles },
      body,
    );
    return {
      success: true,
      roomId: room.roomId,
      name: room.name,
      minPlayers: room.minPlayers,
      maxPlayers: room.maxPlayers,
      state: room.state,
    };
  }
}
