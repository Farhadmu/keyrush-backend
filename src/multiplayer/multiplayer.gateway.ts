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
      const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:3000')
        .split(',')
        .map(o => o.trim())
        .concat(['http://localhost:3000', 'http://127.0.0.1:3000']);
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(new Error(`WebSocket CORS origin rejected: ${origin}`));
    },
    credentials: true,
  },
  namespace: '/racing',
})
export class MultiplayerGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private countdownTimers: Map<string, NodeJS.Timeout> = new Map();
  private disconnectGraceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly roomManager: RoomManager,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.headers.authorization;
      const token = client.handshake.auth?.token || (authHeader ? authHeader.replace('Bearer ', '') : null);

      // Allow spectators to connect without full token if marked as spectator
      if (!token && client.handshake.query?.spectator === 'true') {
        client.data.isSpectator = true;
        client.emit('race:connected', { role: 'SPECTATOR' });
        return;
      }

      if (!token) {
        client.emit('race:error', {
          code: 'UNAUTHORIZED_GUEST',
          message: 'Guest users cannot participate in multiplayer races. Please log in.',
        });
        client.disconnect();
        return;
      }

      const secret = process.env.JWT_SECRET;
      if (!secret && process.env.NODE_ENV === 'production') {
        throw new Error('CRITICAL: JWT_SECRET missing in production');
      }
      const payload = this.jwtService.verify(token, {
        secret: secret || 'keyrush_jwt_secret_dev_key_2026',
      });

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
    // Clean up spectator
    if (client.data?.currentSpectatingRoom) {
      this.roomManager.removeSpectator(client.data.currentSpectatingRoom, client.id);
    }

    const user = client.data?.user;
    const roomId = client.data?.currentRoomId;

    if (user && roomId) {
      const room = this.roomManager.getRoom(roomId);
      if (room && room.state === RoomState.IN_PROGRESS) {
        // Active race: Apply 15-second disconnect grace period
        this.roomManager.markPlayerDisconnected(roomId, user.userId);
        this.server.to(roomId).emit('race:playerDisconnected', {
          userId: user.userId,
          username: user.username,
          graceSeconds: 15,
        });

        const timerKey = `${roomId}:${user.userId}`;
        const timer = setTimeout(() => {
          this.disconnectGraceTimers.delete(timerKey);
          try {
            const { remainingCount } = this.roomManager.leaveRoom(roomId, user.userId);
            this.server.to(roomId).emit('race:playerLeft', {
              userId: user.userId,
              username: user.username,
              remainingCount,
            });
          } catch (e) {}
        }, 15000);

        this.disconnectGraceTimers.set(timerKey, timer);
      } else {
        // Lobby or waiting: Leave immediately
        try {
          const { remainingCount } = this.roomManager.leaveRoom(roomId, user.userId);
          this.server.to(roomId).emit('race:playerLeft', {
            userId: user.userId,
            username: user.username,
            remainingCount,
          });
        } catch (e) {}
      }
    }
  }

  @SubscribeMessage('race:join')
  async handleJoinRoom(
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
      const { room, participant } = await this.roomManager.joinRoom(
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

      // Acknowledge joining player with reconnect token
      client.emit('race:joined', {
        roomId: room.roomId,
        name: room.name,
        hostUserId: room.hostUserId,
        minPlayers: room.minPlayers,
        maxPlayers: room.maxPlayers,
        state: room.state,
        passage: room.passage,
        participants: participantsList,
        reconnectToken: participant.reconnectToken,
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

  @SubscribeMessage('race:reconnect')
  handleReconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string; userId: string; reconnectToken: string },
  ) {
    try {
      const timerKey = `${data.roomId}:${data.userId}`;
      if (this.disconnectGraceTimers.has(timerKey)) {
        clearTimeout(this.disconnectGraceTimers.get(timerKey)!);
        this.disconnectGraceTimers.delete(timerKey);
      }

      const { room, participant } = this.roomManager.reconnectPlayer(
        data.roomId,
        data.userId,
        data.reconnectToken,
        client.id,
      );

      client.data.user = { userId: participant.userId, username: participant.username, roles: ['PLAYER'] };
      client.data.currentRoomId = room.roomId;
      client.join(room.roomId);

      client.emit('race:reconnected', {
        roomState: room.state,
        passage: room.passage,
        raceStartedAt: room.raceStartedAt,
        myProgress: participant.progressPercent,
      });

      client.to(room.roomId).emit('race:playerReconnected', {
        userId: participant.userId,
        username: participant.username,
      });
    } catch (err: any) {
      client.emit('race:error', { code: 'RECONNECT_FAILED', message: err.message });
    }
  }

  // Spectator Mode
  @SubscribeMessage('spectator:join')
  handleSpectatorJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    try {
      const room = this.roomManager.addSpectator(data.roomId, client.id);
      client.data.currentSpectatingRoom = room.roomId;
      client.join(room.roomId);

      const participantsList = Array.from(room.participants.values()).map(p => ({
        userId: p.userId,
        username: p.username,
        carId: p.carId,
        progressPercent: p.progressPercent,
        netWpm: p.netWpm,
        speed: p.speed,
        rankPosition: p.rankPosition,
      }));

      client.emit('spectator:joined', {
        roomId: room.roomId,
        name: room.name,
        state: room.state,
        passage: room.passage,
        participants: participantsList,
        spectatorCount: room.spectators.size,
      });
    } catch (err: any) {
      client.emit('race:error', { code: 'SPECTATE_FAILED', message: err.message });
    }
  }

  @SubscribeMessage('spectator:leave')
  handleSpectatorLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    this.roomManager.removeSpectator(data.roomId, client.id);
    client.leave(data.roomId);
    client.data.currentSpectatingRoom = null;
    client.emit('spectator:left', { roomId: data.roomId });
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
  handleTypingUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      roomId: string;
      textBuffer?: string;
      typedIndex?: number;
      errorCount?: number;
      rawInputCount?: number;
      sequenceNumber?: number;
      clientTimestamp?: number;
    },
  ) {
    const user = client.data.user;
    if (!user) return;

    const { participant, raceFinished } = this.roomManager.updatePlayerTyping(
      data.roomId,
      user.userId,
      data,
    );

    if (!participant) return;

    // Broadcast authoritative position tick to room and spectators
    this.server.to(data.roomId).emit('race:progress', {
      userId: participant.userId,
      username: participant.username,
      typedIndex: participant.typedIndex,
      progressPercent: participant.progressPercent,
      netWpm: participant.netWpm,
      rawWpm: participant.rawWpm,
      accuracy: participant.accuracy,
      speed: participant.speed,
      rankPosition: participant.rankPosition,
      nitroActive: participant.nitroActive,
      finished: participant.finished,
      finishTimeMs: participant.finishTimeMs,
      isFlaggedSuspicious: participant.isFlaggedSuspicious,
    });

    if (participant.finished && participant.progressPercent === 100) {
      this.server.to(data.roomId).emit('race:playerFinished', {
        userId: participant.userId,
        username: participant.username,
        rankPosition: participant.rankPosition,
        finishTimeMs: participant.finishTimeMs,
        netWpm: participant.netWpm,
        accuracy: participant.accuracy,
      });
    }

    if (raceFinished) {
      const room = this.roomManager.getRoom(data.roomId);
      const podium = room
        ? Array.from(room.participants.values()).sort((a, b) => a.rankPosition - b.rankPosition)
        : [];

      this.server.to(data.roomId).emit('race:ended', {
        roomId: data.roomId,
        podium: podium.map(p => ({
          userId: p.userId,
          username: p.username,
          rankPosition: p.rankPosition,
          carId: p.carId,
          netWpm: p.netWpm,
          accuracy: p.accuracy,
          finishTimeMs: p.finishTimeMs,
        })),
      });
    }
  }

  @SubscribeMessage('race:leave')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { roomId: string },
  ) {
    const user = client.data.user;
    if (!user) return;

    try {
      const { remainingCount } = this.roomManager.leaveRoom(data.roomId, user.userId);
      client.leave(data.roomId);
      client.data.currentRoomId = null;

      this.server.to(data.roomId).emit('race:playerLeft', {
        userId: user.userId,
        username: user.username,
        remainingCount,
      });

      client.emit('race:left', { roomId: data.roomId });
    } catch (err: any) {
      client.emit('race:error', { code: 'LEAVE_FAILED', message: err.message });
    }
  }
}
