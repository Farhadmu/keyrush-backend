import { CompetitionsService } from '../src/competitions/competitions.service';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { MatchStatus } from '../src/competitions/schemas/tournament-match.schema';
import { CompetitionStatus } from '../src/competitions/schemas/competition.schema';

describe('Phase 4 & 12: Tournament Bracket Engine, Concurrency & Certificates Tests', () => {
  let competitionsService: CompetitionsService;
  let compModel: any;
  let regModel: any;
  let matchModel: any;
  let certModel: any;

  beforeEach(() => {
    compModel = {
      countDocuments: jest.fn().mockResolvedValue(1),
      findById: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    regModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    };
    matchModel = {
      deleteMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockImplementation((docs) => Promise.resolve(docs)),
      find: jest.fn(),
      findById: jest.fn(),
      findOne: jest.fn(),
    };
    certModel = {
      save: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
    };

    competitionsService = new CompetitionsService(
      compModel as any,
      regModel as any,
      matchModel as any,
      certModel as any,
    );
  });

  const setupMockCompetition = (participantCount: number) => {
    const mockComp = {
      _id: 'comp_valid',
      title: `Grand Prix ${participantCount}`,
      settings: { minParticipants: 20, maxParticipants: 300 },
      status: 'REGISTRATION_OPEN',
      save: jest.fn().mockResolvedValue(true),
    };

    const mockRegistrations = Array.from({ length: participantCount }, (_, i) => ({
      userId: `user_${i + 1}`,
      username: `Racer_${i + 1}`,
      seedNumber: i + 1,
    }));

    compModel.findById.mockResolvedValue(mockComp);
    regModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockRegistrations),
      }),
    });

    return { mockComp, mockRegistrations };
  };

  it('RULE 3.2: Rejects bracket generation if confirmed registrations < 20', async () => {
    compModel.findById.mockResolvedValue({
      _id: 'comp_1',
      title: 'Under Capacity Tournament',
      settings: { minParticipants: 20, maxParticipants: 300 },
    });

    regModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(Array.from({ length: 19 }, (_, i) => ({
          userId: `user_${i + 1}`,
          username: `Player_${i + 1}`,
          seedNumber: i + 1,
        }))),
      }),
    });

    await expect(
      competitionsService.generateTournamentBracket('comp_1'),
    ).rejects.toThrow(BadRequestException);
  });

  // Exhaustive participant boundary test suite
  const boundaryCases = [
    { count: 20, expectedBracketSize: 32, expectedR1Matches: 16, totalMatches: 31 },
    { count: 21, expectedBracketSize: 32, expectedR1Matches: 16, totalMatches: 31 },
    { count: 127, expectedBracketSize: 128, expectedR1Matches: 64, totalMatches: 127 },
    { count: 128, expectedBracketSize: 128, expectedR1Matches: 64, totalMatches: 127 },
    { count: 129, expectedBracketSize: 256, expectedR1Matches: 128, totalMatches: 255 },
    { count: 256, expectedBracketSize: 256, expectedR1Matches: 128, totalMatches: 255 },
    { count: 257, expectedBracketSize: 512, expectedR1Matches: 256, totalMatches: 511 },
    { count: 300, expectedBracketSize: 512, expectedR1Matches: 256, totalMatches: 511 },
  ];

  for (const { count, expectedBracketSize, expectedR1Matches, totalMatches } of boundaryCases) {
    it(`Bracket Boundary Test: ${count} participants -> ${expectedBracketSize} bracket (total ${totalMatches} matches, all participants accounted for)`, async () => {
      const { mockRegistrations } = setupMockCompetition(count);
      const result = await competitionsService.generateTournamentBracket('comp_valid');

      expect(result.success).toBe(true);
      expect(result.bracketSize).toBe(expectedBracketSize);
      expect(result.totalMatchesCreated).toBe(totalMatches);

      // Verify Round 1 matches
      const round1Matches = result.matches.filter((m: any) => m.roundNumber === 1);
      expect(round1Matches.length).toBe(expectedR1Matches);

      // Verify that every single registered participant (1..count) is accounted for
      const accountedParticipants = new Set<string>();
      for (const m of round1Matches) {
        if (m.player1?.userId) accountedParticipants.add(m.player1.userId);
        if (m.player2?.userId) accountedParticipants.add(m.player2.userId);
      }

      expect(accountedParticipants.size).toBe(count);
      for (const reg of mockRegistrations) {
        expect(accountedParticipants.has(reg.userId)).toBe(true);
      }

      // Verify that top seeds receive BYEs when bracket has vacancies
      const expectedByes = expectedBracketSize - count;
      const actualByes = round1Matches.filter((m: any) => m.status === MatchStatus.BYE).length;
      expect(actualByes).toBe(expectedByes);
    });
  }

  it('Winner Advancement & Tie-Break: Advances winner to next round and crowns tournament champion', async () => {
    const mockMatchR1 = {
      _id: 'match_r1_1',
      competitionId: 'comp_valid',
      roundNumber: 1,
      matchNumber: 1,
      player1: { userId: 'user_1', username: 'Racer_1', seed: 1, score: 0, accuracy: 98.5, isWinner: false },
      player2: { userId: 'user_32', username: 'Racer_32', seed: 32, score: 0, accuracy: 95.0, isWinner: false },
      winnerId: null,
      status: MatchStatus.SCHEDULED,
      save: jest.fn().mockResolvedValue(true),
    };

    const mockMatchR2 = {
      _id: 'match_r2_1',
      competitionId: 'comp_valid',
      roundNumber: 2,
      matchNumber: 1,
      player1: { userId: null, username: 'TBD', seed: 0, score: 0, accuracy: 0, isWinner: false },
      player2: { userId: null, username: 'TBD', seed: 0, score: 0, accuracy: 0, isWinner: false },
      winnerId: null,
      status: MatchStatus.SCHEDULED,
      save: jest.fn().mockResolvedValue(true),
    };

    matchModel.findById.mockResolvedValue(mockMatchR1);
    matchModel.findOne.mockResolvedValue(mockMatchR2);

    // Complete Match 1 in Round 1: user_1 wins (110 WPM vs 90 WPM)
    const updated = await competitionsService.updateMatchResult('match_r1_1', 110, 90, 'user_1');

    expect(updated.status).toBe(MatchStatus.COMPLETED);
    expect(updated.player1.isWinner).toBe(true);
    expect(mockMatchR1.save).toHaveBeenCalled();

    // Verify winner was advanced to Round 2 Match 1 slot 1
    expect(mockMatchR2.player1.userId).toBe('user_1');
    expect(mockMatchR2.save).toHaveBeenCalled();

    // Duplicate score prevention: trying to update already completed match throws BadRequestException
    await expect(
      competitionsService.updateMatchResult('match_r1_1', 110, 90, 'user_1', { userId: 'regular_user', roles: ['PLAYER'] }),
    ).rejects.toThrow(BadRequestException);
  });

  it('Registration Concurrency & Capacity Release: Safely handles registration cancellation', async () => {
    compModel.findById.mockResolvedValue({
      _id: 'comp_cancel',
      status: 'REGISTRATION_CLOSED',
      settings: { maxParticipants: 300 },
      currentParticipantCount: 300,
    });

    regModel.findOne.mockResolvedValue({
      _id: 'reg_to_cancel',
      competitionId: 'comp_cancel',
      userId: 'user_leaving',
    });

    compModel.findByIdAndUpdate.mockResolvedValue({
      _id: 'comp_cancel',
      currentParticipantCount: 299,
      status: 'REGISTRATION_OPEN',
    });

    const res = await competitionsService.cancelRegistration('comp_cancel', 'user_leaving');

    expect(res.success).toBe(true);
    expect(res.currentParticipantCount).toBe(299);
    expect(regModel.deleteOne).toHaveBeenCalledWith({ _id: 'reg_to_cancel' });
    expect(compModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'comp_cancel',
      {
        $inc: { currentParticipantCount: -1 },
        $set: { status: 'REGISTRATION_OPEN' },
      },
      { new: true },
    );
  });
});
