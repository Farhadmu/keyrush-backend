import { RoomManager, RoomState } from '../src/multiplayer/room.manager';
import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Absolute Game Rule 3.1: Multiplayer Room Capacity Limits (2-7 Players)', () => {
  let roomManager: RoomManager;
  let typingService: TypingService;
  let racingService: RacingService;

  beforeEach(() => {
    // Mock typing service and racing service without external DB dependency
    typingService = new TypingService({
      countDocuments: jest.fn().mockResolvedValue(1),
      findOne: jest.fn().mockReturnValue({ skip: jest.fn().mockResolvedValue({
        title: 'Quantum Sprint',
        content: 'Testing typing racing mechanics with high precision.',
        wordCount: 7,
      }) }),
    } as any);

    racingService = new RacingService();
    roomManager = new RoomManager(typingService, racingService);
  });

  const createMockPlayer = (id: string, username: string, isGuest: boolean = false) => ({
    userId: id,
    username,
    roles: isGuest ? ['GUEST'] : ['PLAYER'],
  });

  it('RULE 3.1: Guest user cannot create or join multiplayer room (must be rejected)', async () => {
    const guestUser = createMockPlayer('guest_1', 'GuestRacer', true);

    await expect(
      roomManager.createRoom(guestUser, { name: 'Guest Room' }),
    ).rejects.toThrow(ForbiddenException);

    const host = createMockPlayer('player_host', 'HostRacer');
    const room = await roomManager.createRoom(host, { maxPlayers: 7 });

    expect(() => {
      roomManager.joinRoom(room.roomId, guestUser, 'socket_guest');
    }).toThrow(ForbiddenException);
  });

  it('RULE 3.1: Race CANNOT start with 1 player (must require minimum 2 players)', async () => {
    const host = createMockPlayer('player_1', 'RacerOne');
    const room = await roomManager.createRoom(host, { maxPlayers: 7 });

    roomManager.joinRoom(room.roomId, host, 'socket_1');
    const result = roomManager.setPlayerReady(room.roomId, host.userId, true);

    expect(result.canStart).toBe(false);
    expect(result.room.state).toBe(RoomState.WAITING);
  });

  it('RULE 3.1: 2 players is valid and race CAN start when both players are ready', async () => {
    const p1 = createMockPlayer('player_1', 'RacerOne');
    const p2 = createMockPlayer('player_2', 'RacerTwo');

    const room = await roomManager.createRoom(p1, { maxPlayers: 7 });
    roomManager.joinRoom(room.roomId, p1, 'socket_1');
    roomManager.joinRoom(room.roomId, p2, 'socket_2');

    roomManager.setPlayerReady(room.roomId, p1.userId, true);
    const readyResult = roomManager.setPlayerReady(room.roomId, p2.userId, true);

    expect(readyResult.canStart).toBe(true);
    expect(readyResult.room.participants.size).toBe(2);
  });

  it('RULE 3.1: Room accepts exactly up to 7 players', async () => {
    const host = createMockPlayer('player_1', 'Racer1');
    const room = await roomManager.createRoom(host, { maxPlayers: 7 });

    roomManager.joinRoom(room.roomId, host, 'socket_1');

    for (let i = 2; i <= 7; i++) {
      const p = createMockPlayer(`player_${i}`, `Racer${i}`);
      const { room: updatedRoom } = roomManager.joinRoom(room.roomId, p, `socket_${i}`);
      expect(updatedRoom.participants.size).toBe(i);
    }

    expect(room.participants.size).toBe(7);
  });

  it('RULE 3.1: 8th player MUST be strictly rejected (ROOM_CAPACITY_EXCEEDED)', async () => {
    const host = createMockPlayer('player_1', 'Racer1');
    const room = await roomManager.createRoom(host, { maxPlayers: 7 });

    roomManager.joinRoom(room.roomId, host, 'socket_1');

    for (let i = 2; i <= 7; i++) {
      const p = createMockPlayer(`player_${i}`, `Racer${i}`);
      roomManager.joinRoom(room.roomId, p, `socket_${i}`);
    }

    expect(room.participants.size).toBe(7);

    // Attempting to join an 8th player
    const eighthPlayer = createMockPlayer('player_8', 'Racer8');
    expect(() => {
      roomManager.joinRoom(room.roomId, eighthPlayer, 'socket_8');
    }).toThrow(BadRequestException);
  });

  it('RULE 3.1: A player cannot occupy multiple slots in the same room', async () => {
    const host = createMockPlayer('player_1', 'Racer1');
    const room = await roomManager.createRoom(host, { maxPlayers: 7 });

    roomManager.joinRoom(room.roomId, host, 'socket_1');
    expect(room.participants.size).toBe(1);

    // Same user rejoins (e.g. reconnect or duplicate tab)
    roomManager.joinRoom(room.roomId, host, 'socket_reconnected');
    expect(room.participants.size).toBe(1); // slot count unchanged
  });
});
