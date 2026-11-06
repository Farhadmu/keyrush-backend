import { CompetitionsService } from '../src/competitions/competitions.service';
import { BadRequestException } from '@nestjs/common';

describe('Phase 4 & 12: Tournament Bracket Engine & Verifiable Certificates Tests', () => {
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
    };
    regModel = {
      find: jest.fn(),
      findOne: jest.fn(),
    };
    matchModel = {
      deleteMany: jest.fn().mockResolvedValue({}),
      insertMany: jest.fn().mockImplementation((docs) => Promise.resolve(docs)),
      find: jest.fn(),
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

  it('RULE 3.2: Rejects bracket generation if confirmed registrations < 20', async () => {
    compModel.findById.mockResolvedValue({
      _id: 'comp_1',
      title: 'Under Capacity Tournament',
      settings: { minParticipants: 20, maxParticipants: 300 },
    });

    // Only 15 registered participants
    regModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(Array.from({ length: 15 }, (_, i) => ({
          userId: `user_${i}`,
          username: `Player_${i}`,
          seedNumber: i + 1,
        }))),
      }),
    });

    await expect(
      competitionsService.generateTournamentBracket('comp_1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('Generates seeded bracket matches when participant threshold (>= 20) is met', async () => {
    compModel.findById.mockResolvedValue({
      _id: 'comp_valid',
      title: 'Valid Grand Prix 2026',
      settings: { minParticipants: 20, maxParticipants: 300 },
      status: 'REGISTRATION_OPEN',
      save: jest.fn().mockResolvedValue(true),
    });

    // 24 confirmed participants
    regModel.find.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(Array.from({ length: 24 }, (_, i) => ({
          userId: `user_${i + 1}`,
          username: `Racer_${i + 1}`,
          seedNumber: i + 1,
        }))),
      }),
    });

    const result = await competitionsService.generateTournamentBracket('comp_valid');

    expect(result.success).toBe(true);
    expect(result.bracketSize).toBe(32);
    expect(result.totalMatchesCreated).toBe(16); // 32 / 2 = 16 first-round matches
  });
});
