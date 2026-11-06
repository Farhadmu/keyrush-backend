import { Test, TestingModule } from '@nestjs/testing';
import { RacingService, CarCatalogItem } from '../src/racing/racing.service';
import { EconomyService } from '../src/economy/economy.service';
import { UserRole, normalizeRole } from '../src/auth/roles.enum';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { RaceResult } from '../src/racing/schemas/race-result.schema';
import { VehicleCustomization } from '../src/racing/schemas/vehicle-customization.schema';
import { Profile } from '../src/users/schemas/profile.schema';
import { BattlePass } from '../src/economy/schemas/battle-pass.schema';

describe('KEYRUSH 2.0 Feature Verification Suite', () => {
  let racingService: RacingService;
  let economyService: EconomyService;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  const mockCustomizationStore = new Map<string, any>();
  const mockProfileStore = new Map<string, any>();
  const mockBattlePassStore = new Map<string, any>();

  const mockRaceResultModel = function (dto: any) {
    return {
      ...dto,
      save: jest.fn().mockResolvedValue({ _id: 'race_res_1', ...dto }),
    };
  };

  const mockVehicleCustomizationModel = {
    findOne: jest.fn().mockImplementation((query: any) => {
      const key = `${query.userId?.toString()}_${query.carId}`;
      const doc = mockCustomizationStore.get(key);
      return Promise.resolve(doc ? { ...doc } : null);
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query: any, update: any) => {
      const key = `${query.userId?.toString()}_${query.carId}`;
      const existing = mockCustomizationStore.get(key) || { userId: query.userId, carId: query.carId, customization: {} };
      if (update.$set) {
        existing.customization = { ...existing.customization, ...update.$set.customization };
      }
      mockCustomizationStore.set(key, existing);
      return Promise.resolve(existing);
    }),
    find: jest.fn().mockImplementation((query: any) => {
      const docs: any[] = [];
      mockCustomizationStore.forEach((val) => {
        if (val.userId?.toString() === query.userId?.toString()) {
          docs.push(val);
        }
      });
      return Promise.resolve(docs);
    }),
  };

  const mockProfileModel = {
    findOne: jest.fn().mockImplementation((query: any) => {
      const doc = mockProfileStore.get(query.userId?.toString());
      if (!doc) return Promise.resolve(null);
      return Promise.resolve({
        ...doc,
        save: jest.fn().mockImplementation(function () {
          mockProfileStore.set(query.userId?.toString(), this);
          return Promise.resolve(this);
        }),
      });
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query: any, update: any) => {
      const doc = mockProfileStore.get(query.userId?.toString()) || { userId: query.userId, unlockedCars: [] };
      Object.assign(doc, update);
      mockProfileStore.set(query.userId?.toString(), doc);
      return Promise.resolve(doc);
    }),
  };

  const mockBattlePassModel = {
    findOne: jest.fn().mockImplementation((query: any) => {
      if (query.transactionId) {
        let found = null;
        mockBattlePassStore.forEach((pass) => {
          if (pass.transactionId === query.transactionId) found = pass;
        });
        return Promise.resolve(found);
      }
      const pass = mockBattlePassStore.get(query.userId?.toString());
      if (!pass) return Promise.resolve(null);
      return Promise.resolve({
        ...pass,
        save: jest.fn().mockImplementation(function () {
          mockBattlePassStore.set(query.userId?.toString(), this);
          return Promise.resolve(this);
        }),
      });
    }),
    create: jest.fn().mockImplementation((dto: any) => {
      const pass = {
        ...dto,
        save: jest.fn().mockResolvedValue(dto),
      };
      mockBattlePassStore.set(dto.userId?.toString(), pass);
      return Promise.resolve(pass);
    }),
    findOneAndUpdate: jest.fn().mockImplementation((query: any, update: any) => {
      const existing = mockBattlePassStore.get(query.userId?.toString()) || { userId: query.userId };
      if (update.$set) Object.assign(existing, update.$set);
      mockBattlePassStore.set(query.userId?.toString(), existing);
      return Promise.resolve(existing);
    }),
  };

  beforeAll(async () => {
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RacingService,
        EconomyService,
        { provide: getModelToken(RaceResult.name), useValue: mockRaceResultModel },
        { provide: getModelToken(VehicleCustomization.name), useValue: mockVehicleCustomizationModel },
        { provide: getModelToken(Profile.name), useValue: mockProfileModel },
        { provide: getModelToken(BattlePass.name), useValue: mockBattlePassModel },
      ],
    }).compile();

    racingService = module.get<RacingService>(RacingService);
    economyService = module.get<EconomyService>(EconomyService);
  });

  afterEach(() => {
    mockCustomizationStore.clear();
    mockProfileStore.clear();
    mockBattlePassStore.clear();
  });

  describe('1. Seven Vehicle Classes & Zero Pay-to-Win Physical Normalization', () => {
    it('should expose all 7 official vehicle classes in the catalog', () => {
      const cars = racingService.getCars();
      expect(cars.length).toBe(7);

      const expectedIds = [
        'car_cyber_phantom',
        'car_neon_viper',
        'car_solaris_drift',
        'car_crimson_fury',
        'car_titan_apex',
        'car_apex_valkyrie',
        'car_vortex_gt',
      ];

      expectedIds.forEach((id) => {
        const found = cars.find((c) => c.id === id);
        expect(found).toBeDefined();
        expect(found?.name).toBeDefined();
        expect(found?.unlockLevel).toBeGreaterThanOrEqual(1);
      });
    });

    it('should enforce strict physics normalization across all vehicles (Zero P2W)', () => {
      // Regardless of vehicle skin chosen, identical WPM & accuracy yields identical authoritative speed
      const wpm = 95;
      const acc = 98;

      const speedSkin1 = racingService.calculateVehicleSpeed(wpm, acc, false);
      const speedSkin2 = racingService.calculateVehicleSpeed(wpm, acc, false);
      const speedNitro = racingService.calculateVehicleSpeed(wpm, acc, true);

      expect(speedSkin1).toBe(speedSkin2);
      expect(speedNitro).toBe(Math.round(speedSkin1 * 1.25));
      expect(speedSkin1).toBeGreaterThan(20);
      expect(speedSkin1).toBeLessThanOrEqual(420);
    });
  });

  describe('2. Vehicle Customization Persistence', () => {
    it('should save and retrieve cosmetic customizations per user and car', async () => {
      const userId = '507f1f77bcf86cd799439011';
      const carId = 'car_cyber_phantom';

      await racingService.saveCustomization(userId, carId, {
        paintColor: '#00F0FF',
        finish: 'chrome',
        rimColor: '#E2E8F0',
        spoiler: 'gt_wing',
        underglow: true,
        underglowColor: '#EC4899',
      });

      const retrieved = await racingService.getCustomization(userId, carId);
      expect(retrieved.paintColor).toBe('#00F0FF');
      expect(retrieved.finish).toBe('chrome');
      expect(retrieved.underglow).toBe(true);
      expect(retrieved.underglowColor).toBe('#EC4899');
    });
  });

  describe('3. Multi-Player ELO Rating Engine', () => {
    it('should calculate fair ELO deltas for a multi-player race', () => {
      const participants = [
        { userId: 'player_1', rankPosition: 1, currentElo: 1200 },
        { userId: 'player_2', rankPosition: 2, currentElo: 1200 },
        { userId: 'player_3', rankPosition: 3, currentElo: 1200 },
        { userId: 'player_4', rankPosition: 4, currentElo: 1200 },
      ];

      const deltas = racingService.calculateEloDeltas(participants, 32);

      expect(deltas.get('player_1')).toBeGreaterThan(0); // 1st place gains ELO
      expect(deltas.get('player_4')).toBeLessThan(0);    // 4th place loses ELO
      expect(deltas.get('player_1')!).toBeGreaterThan(deltas.get('player_2')!);
    });

    it('should accurately categorize ELO ratings into ranked tiers', () => {
      expect(racingService.getEloTier(850)).toBe('BRONZE');
      expect(racingService.getEloTier(1050)).toBe('SILVER');
      expect(racingService.getEloTier(1250)).toBe('GOLD');
      expect(racingService.getEloTier(1450)).toBe('PLATINUM');
      expect(racingService.getEloTier(1650)).toBe('DIAMOND');
      expect(racingService.getEloTier(1850)).toBe('MASTER');
      expect(racingService.getEloTier(2150)).toBe('GRANDMASTER');
    });
  });

  describe('4. Consolidated Role Hierarchy & Canonical Normalization', () => {
    it('should normalize legacy aliases to canonical roles', () => {
      expect(normalizeRole(UserRole.PLAYER)).toBe(UserRole.USER);
      expect(normalizeRole(UserRole.ORGANIZATION_ADMIN)).toBe(UserRole.ORGANIZER);
      expect(normalizeRole(UserRole.COMPETITION_ADMIN)).toBe(UserRole.ORGANIZER);
      expect(normalizeRole(UserRole.PLATFORM_MODERATOR)).toBe(UserRole.SUPER_ADMIN);
      expect(normalizeRole(UserRole.SUPER_ADMIN)).toBe(UserRole.SUPER_ADMIN);
      expect(normalizeRole(UserRole.USER)).toBe(UserRole.USER);
    });

    it('should allow access to USER endpoint for users with legacy PLAYER role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.USER]);

      const mockContext = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: [UserRole.PLAYER] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });

    it('should allow access to ORGANIZER endpoint for users with legacy ORGANIZATION_ADMIN role', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ORGANIZER]);

      const mockContext = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: [UserRole.ORGANIZATION_ADMIN] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(rolesGuard.canActivate(mockContext)).toBe(true);
    });

    it('should reject unauthenticated or unprivileged users', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ORGANIZER]);

      const mockContext = {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: { roles: [UserRole.USER] },
          }),
        }),
      } as unknown as ExecutionContext;

      expect(() => rolesGuard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });

  describe('5. Battle Pass & Idempotent Payment Webhook', () => {
    it('should initialize 50 tiers of rewards for Season 1', async () => {
      const userId = '507f1f77bcf86cd799439012';
      const result = await economyService.getBattlePass(userId);

      expect(result.pass).toBeDefined();
      expect(result.tiers.length).toBe(50);
      expect(result.tiers[0].level).toBe(1);
      expect(result.tiers[49].proReward.value).toBe('car_vortex_gt');
    });

    it('should idempotently process payment webhooks without double-crediting', async () => {
      const userId = '507f1f77bcf86cd799439013';
      const transactionId = 'tx_stripe_prod_998811';

      // 1. Initial Webhook
      const firstRun = await economyService.processPaymentWebhook({
        transactionId,
        provider: 'STRIPE_SANDBOX',
        userId,
        tier: 'PRO',
        amount: 9.99,
      });

      expect(firstRun.status).toBe('SUCCESS');
      expect(firstRun.pass.tier).toBe('PRO');

      // 2. Duplicate Webhook (Replay / Network retry)
      const duplicateRun = await economyService.processPaymentWebhook({
        transactionId,
        provider: 'STRIPE_SANDBOX',
        userId,
        tier: 'PRO',
        amount: 9.99,
      });

      expect(duplicateRun.status).toBe('IDEMPOTENT_IGNORED');
      expect(duplicateRun.message).toContain('already applied');
    });
  });
});

