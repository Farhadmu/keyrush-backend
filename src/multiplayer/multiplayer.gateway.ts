import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { RoomManager, RoomState } from './room.manager';
import { UsersService } from '../users/users.service';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      callback(null, true);
    },
    credentials: true,
  },
  namespace: '/racing',
})
export class MultiplayerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // Active countdown intervals per roomId
  private countdownTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly roomManager: RoomManager,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const token = client.handshake.auth?.token || (authHeader ? authHeader.replace('Bearer ', '') : null);

      if (!token) {
        // Disallow unauthenticated guests from multiplayer
        client.emit('race:error', {
          code: 'UNAUTHORIZED_GUEST',
          message: 'Guest users cannot participate in multiplayer races. Please log in.',
        });
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET || 'keyrush_jwt_secret_dev_key_2026';
      const payload = this.jwtService.verify(token, { secret });

      if (!payload || !payload.sub) {
        client.emit('race:error', { code: 'INVALID_TOKEN', message: 'Session expired or invalid.' });
        client.disconnect();
        return;
      }

      client.data.user = {
        userId: payload.sub,
        username: payload.username,
        roles: payload.roles || ['PLAYER'],
        organizationId: payload.organizationId || null,
      };

      client.emit('race:connected', {
        userId: payload.sub,
        username: payload.username,
      });
    } catch (err) {
      client.emit('race:error', {
        code: 'AUTH_FAILED',
        message: 'Authentication error during socket handshake.',
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    if (user && client.data?.currentRoomId) {
      const roomId = client.data.currentRoomId;
      try {
        const { room, remainingCount } = this.roomManager.leaveRoom(roomId, user.userId);
        this.server.to(roomId).emit('race:playerLeft', {
          userId: user.userId,
          username: user.username,
          remainingCount,
        });
      } catch (e) {
        // room already cleaned up
      }
    }
  }

  @SubscribeMessage('race:join')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; carId?: string },
  ) {
    const user = client.data.user;
    if (!user) {
      return client.emit('race:error', {
        code: 'UNAUTHENTICATED',
        message: 'You must be logged in to join a race.',
      });
    }

    try {
      const { room, participant } = this.roomManager.joinRoom(
        data.roomId,
        user,
        client.id,
        data.carId || 'car_cyber_phantom',
      );

      client.data.currentRoomId = room.roomId;
      client.join(room.roomId);

      const participantsList = Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        carId: p.carId,
        isReady: p.isReady,
      }));

      // Acknowledge to joining player
      client.emit('race:joined', {
        roomId: room.roomId,
        name: room.name,
        hostUserId: room.hostUserId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        state: room.state,
        passage: room.passage,
        participants: participantsList,
      });

      // Broadcast to other players in the room
      client.to(room.roomId).emit('race:playerJoined', {
        participant: {
          userId: participant.userId,
          username: participant.username,
          carId: participant.carId,
          isReady: participant.isReady,
        },
        currentCount: room.participants.size,
      });
    } catch (err: any) {
      client.emit('race:error', {
        code: 'JOIN_FAILED',
        message: err.message || 'Could not join room.',
      });
    }
  }

  @SubscribeMessage('race:ready')
  handleReady(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; isReady: boolean },
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      const { room, canStart } = this.roomManager.setPlayerReady(data.roomId, user.userId, data.isReady);

      this.server.to(data.roomId).emit('race:readyUpdate', {
        userId: user.userId,
        isReady: data.isReady,
        canStart,
      });

      if (canStart && room.state === RoomState.WAITING) {
        this.startCountdown(room.roomId);
      }
    } catch (err: any) {
      client.emit('race:error', { code: 'READY_FAILED', message: err.message });
    }
  }

  private startCountdown(roomId: string) {
    const room = this.roomManager.getRoom(roomId);
    if (!room) return;

    room.state = RoomState.COUNTDOWN;
    let countdown = 5;

    const timer = setInterval(() => {
      // Rule 3.1: Minimum 2 players required. If a player leaves during countdown, abort.
      if (room.participants.size < 2) {
        clearInterval(timer);
        this.countdownTimers.delete(roomId);
        room.state = RoomState.WAITING;
        this.server.to(roomId).emit('race:countdownAborted', {
          message: 'Countdown cancelled: Minimum 2 players required to race.',
        });
        return;
      }

      this.server.to(roomId).emit('race:countdown', {
        secondsRemaining: countdown,
        passage: room.passage,
      });

      countdown--;

      if (countdown < 0) {
        clearInterval(timer);
        this.countdownTimers.delete(roomId);
        room.state = RoomState.IN_PROGRESS;
        room.raceStartedAt = Date.now();

        this.server.to(roomId).emit('race:started', {
          raceStartedAt: room.raceStartedAt,
        });
      }
    }, 1000);

    this.countdownTimers.set(roomId, timer);
  }

  @SubscribeMessage('race:typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      typedIndex: number;
      errorCount: number;
      rawInputCount: number;
    },
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      const { participant, raceFinished } = this.roomManager.updatePlayerTyping(
        data.roomId,
        user.userId,
        data,
      );

      if (!participant) return;

      const room = this.roomManager.getRoom(data.roomId);
      if (!room) return;

      // Broadcast progress snapshot to all players in the room
      const positions = Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        progressPercent: p.progressPercent,
        netWpm: p.netWpm,
        rawWpm: p.rawWpm,
        accuracy: p.accuracy,
        speed: p.speed,
        nitroActive: p.nitroActive,
        rankPosition: p.rankPosition,
        finished: p.finished,
      }));

      this.server.to(data.roomId).emit('race:progress', { positions });

      if (raceFinished) {
        const finalResults = Array.from(room.participants.values()).map(p => ({
          userId: p.userId,
          username: p.username,
          carId: p.carId,
          rankPosition: p.rankPosition,
          netWpm: p.netWpm,
          accuracy: p.accuracy,
          finishTimeMs: p.finishTimeMs,
        }));

        this.server.to(data.roomId).emit('race:finished', {
          results: finalResults,
        });

        // Update statistics for all participants
        finalResults.forEach(res => {
          this.usersService.recordRaceStats(res.userId, {
            wpm: res.netWpm,
            accuracy: res.accuracy,
            won: res.rankPosition === 1,
            durationMs: res.finishTimeMs,
          }).catch(() => {});
        });
      }
    } catch (err: any) {
      client.emit('race:error', { code: 'TYPING_UPDATE_ERROR', message: err.message });
    }
  }

  @SubscribeMessage('race:leave')
  handleLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      const { room, remainingCount } = this.roomManager.leaveRoom(data.roomId, user.userId);
      client.leave(data.roomId);
      client.data.currentRoomId = null;

      this.server.to(data.roomId).emit('race:playerLeft', {
        userId: user.userId,
        username: user.username,
        remainingCount,
      });
    } catch (err: any) {
      client.emit('race:error', { code: 'LEAVE_ERROR', message: err.message });
    }
  }
}
