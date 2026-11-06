import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RaceResult, RaceResultDocument } from './schemas/race-result.schema';
import { VehicleCustomization, VehicleCustomizationDocument, VehicleCustomizationOptions } from './schemas/vehicle-customization.schema';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';

export interface CarCatalogItem {
  id: string;
  name: string;
  category: string;
  description: string;
  topSpeedKmh: number;
  nitroColor: string;
  primaryColor: string;
  accentColor: string;
  unlockLevel: number;
}

@Injectable()
export class RacingService {
  private readonly logger = new Logger(RacingService.name);

  private readonly cars: CarCatalogItem[] = [
    {
      id: 'car_cyber_phantom',
      name: 'Cyber Phantom GT',
      category: 'Hyper-EV',
      description: 'Streamlined aerodynamic chassis engineered for sub-millisecond throttle response.',
      topSpeedKmh: 360,
      nitroColor: '#00f0ff',
      primaryColor: '#3b82f6',
      accentColor: '#60a5fa',
      unlockLevel: 1,
    },
    {
      id: 'car_neon_viper',
      name: 'Neon Viper X',
      category: 'Esports Prototype',
      description: 'Ultra-lightweight graphene body with twin plasma thrust exhausts.',
      topSpeedKmh: 375,
      nitroColor: '#a855f7',
      primaryColor: '#8b5cf6',
      accentColor: '#c084fc',
      unlockLevel: 5,
    },
    {
      id: 'car_solaris_drift',
      name: 'Solaris Apex',
      category: 'Grand Tourer',
      description: 'Gold-alloy plated hypercar tuned for flawless high-speed highway sprints.',
      topSpeedKmh: 350,
      nitroColor: '#eab308',
      primaryColor: '#f59e0b',
      accentColor: '#fbbf24',
      unlockLevel: 10,
    },
    {
      id: 'car_crimson_fury',
      name: 'Crimson Fury RS',
      category: 'Track Beast',
      description: 'Raw aerodynamic downforce with active aero stabilizers.',
      topSpeedKmh: 380,
      nitroColor: '#ef4444',
      primaryColor: '#dc2626',
      accentColor: '#f87171',
      unlockLevel: 20,
    },
    {
      id: 'car_titan_apex',
      name: 'Titan Apex EV',
      category: 'Electric Prototype',
      description: 'Zero-emission extreme downforce racecar with dual active floor venturis.',
      topSpeedKmh: 370,
      nitroColor: '#06b6d4',
      primaryColor: '#0ea5e9',
      accentColor: '#38bdf8',
      unlockLevel: 25,
    },
    {
      id: 'car_apex_valkyrie',
      name: 'Apex Valkyrie',
      category: 'Futuristic Hypercar',
      description: 'Le Mans prototype inspired chassis featuring active central stabilization fin.',
      topSpeedKmh: 385,
      nitroColor: '#10b981',
      primaryColor: '#059669',
      accentColor: '#34d399',
      unlockLevel: 35,
    },
    {
      id: 'car_vortex_gt',
      name: 'Vortex GT Esports',
      category: 'Esports Special Edition',
      description: 'Official tournament edition machine with tuned telemetry and competition livery.',
      topSpeedKmh: 390,
      nitroColor: '#ec4899',
      primaryColor: '#db2777',
      accentColor: '#f472b6',
      unlockLevel: 50,
    },
  ];

  constructor(
    @InjectModel(RaceResult.name) private readonly raceResultModel: Model<RaceResultDocument>,
    @InjectModel(Profile.name) private readonly profileModel: Model<ProfileDocument>,
    @Optional() @InjectModel(VehicleCustomization.name) private readonly customizationModel?: Model<VehicleCustomizationDocument>,
  ) {}

  getCars(): CarCatalogItem[] {
    return this.cars;
  }

  getCarById(id: string): CarCatalogItem {
    return this.cars.find(c => c.id === id) || this.cars[0];
  }

  // Authoritative vehicle speed formula (Zero Pay-to-Win normalization across all skins)
  calculateVehicleSpeed(netWpm: number, accuracy: number, nitroActive: boolean = false): number {
    const accuracyFactor = Math.pow(Math.max(0, accuracy) / 100, 2);
    const effectiveWpm = netWpm * accuracyFactor;
    const baseSpeed = 20; // km/h idle roll
    const speedMultiplier = 2.8;

    let speed = baseSpeed + effectiveWpm * speedMultiplier;
    if (nitroActive) {
      speed *= 1.25; // 25% nitro boost
    }

    return Math.min(Math.round(speed), 420); // 420 km/h cap
  }

  // Multi-player ELO Calculation
  calculateEloDeltas(
    participants: Array<{ userId: string; rankPosition: number; currentElo: number }>,
    kFactor: number = 32,
  ): Map<string, number> {
    const deltas = new Map<string, number>();
    const n = participants.length;
    if (n < 2) return deltas;

    for (let i = 0; i < n; i++) {
      const pA = participants[i];
      let totalChange = 0;

      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const pB = participants[j];

        // Actual score S_A: 1 for win, 0.5 for tie, 0 for loss
        let sA = 0.5;
        if (pA.rankPosition < pB.rankPosition) sA = 1.0;
        else if (pA.rankPosition > pB.rankPosition) sA = 0.0;

        // Expected score E_A
        const expectedA = 1 / (1 + Math.pow(10, (pB.currentElo - pA.currentElo) / 400));
        totalChange += (sA - expectedA);
      }

      const scaledChange = Math.round((kFactor / (n - 1)) * totalChange);
      deltas.set(pA.userId, scaledChange);
    }

    return deltas;
  }

  getEloTier(elo: number): string {
    if (elo >= 2000) return 'GRANDMASTER';
    if (elo >= 1800) return 'MASTER';
    if (elo >= 1600) return 'DIAMOND';
    if (elo >= 1400) return 'PLATINUM';
    if (elo >= 1200) return 'GOLD';
    if (elo >= 1000) return 'SILVER';
    return 'BRONZE';
  }

  // Generates calibrated bot racers for single-player practice
  generateBots(count: number = 3, targetWpm: number = 65) {
    const botNames = ['ByteRacer', 'SpeedyAI', 'CyberGlide', 'TurboBot', 'AlgoRacer', 'NitroCoder'];
    const bots = [];

    for (let i = 0; i < count; i++) {
      const variance = (Math.random() - 0.5) * 20;
      const botWpm = Math.max(30, Math.round(targetWpm + variance));
      const randomCar = this.cars[i % this.cars.length];

      bots.push({
        id: `bot_${i + 1}`,
        username: botNames[i % botNames.length],
        isBot: true,
        carId: randomCar.id,
        targetWpm: botWpm,
        currentProgress: 0,
        speed: 0,
        nitroActive: false,
      });
    }

    return bots;
  }

  // Customization methods
  async getCustomization(userId: string, carId: string): Promise<VehicleCustomizationOptions> {
    if (!this.customizationModel || !Types.ObjectId.isValid(userId)) {
      return new VehicleCustomizationOptions();
    }
    const doc = await this.customizationModel.findOne({
      userId: new Types.ObjectId(userId),
      carId,
    });
    return doc ? doc.customization : new VehicleCustomizationOptions();
  }

  async saveCustomization(
    userId: string,
    carId: string,
    options: Partial<VehicleCustomizationOptions>,
  ): Promise<VehicleCustomizationDocument> {
    if (!this.customizationModel) {
      return null as any;
    }
    const validCar = this.getCarById(carId);
    return this.customizationModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId), carId: validCar.id },
      { $set: { customization: options } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  }

  async getUserGarage(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      return {
        selectedCarId: 'car_cyber_phantom',
        unlockedCars: ['car_cyber_phantom'],
        allCars: this.cars,
        customizations: {},
      };
    }
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(userId) });
    const unlocked = profile?.unlockedCars && profile.unlockedCars.length > 0 
      ? profile.unlockedCars 
      : ['car_cyber_phantom'];

    const customizationsDocs = this.customizationModel
      ? await this.customizationModel.find({ userId: new Types.ObjectId(userId) })
      : [];

    const customizations: Record<string, VehicleCustomizationOptions> = {};
    for (const doc of customizationsDocs) {
      customizations[doc.carId] = doc.customization;
    }

    return {
      selectedCarId: profile?.selectedCarId || 'car_cyber_phantom',
      unlockedCars: unlocked,
      allCars: this.cars,
      customizations,
      eloRating: profile?.eloRating || 1000,
      eloTier: profile?.eloTier || 'BRONZE',
      level: profile?.level || 1,
      xp: profile?.xp || 0,
    };
  }

  // -------------------------------------------------------------
  // Race Results Persistence & Statistics Calculation
  // -------------------------------------------------------------
  async persistRaceResult(data: {
    roomId: string;
    passageId?: string;
    passageTitle: string;
    language: string;
    participants: Array<{
      userId: string;
      username: string;
      carId: string;
      rankPosition: number;
      netWpm: number;
      rawWpm: number;
      accuracy: number;
      finishTimeMs: number;
      isFlaggedSuspicious?: boolean;
      suspicionReason?: string;
    }>;
    winnerUserId?: string;
    raceStartedAt: number;
    raceFinishedAt: number;
    replaySnapshots?: any[];
  }): Promise<RaceResultDocument> {
    try {
      const result = new this.raceResultModel({
        roomId: data.roomId,
        passageId: data.passageId && Types.ObjectId.isValid(data.passageId) ? new Types.ObjectId(data.passageId) : null,
        passageTitle: data.passageTitle,
        language: data.language || 'EN',
        participants: data.participants.map(p => ({
          userId: Types.ObjectId.isValid(p.userId) ? new Types.ObjectId(p.userId) : null,
          username: p.username,
          carId: p.carId,
          rankPosition: p.rankPosition,
          netWpm: p.netWpm,
          rawWpm: p.rawWpm,
          accuracy: p.accuracy,
          finishTimeMs: p.finishTimeMs,
          isFlaggedSuspicious: !!p.isFlaggedSuspicious,
          suspicionReason: p.suspicionReason || '',
        })),
        winnerUserId: data.winnerUserId && Types.ObjectId.isValid(data.winnerUserId) ? new Types.ObjectId(data.winnerUserId) : null,
        raceStartedAt: new Date(data.raceStartedAt),
        raceFinishedAt: new Date(data.raceFinishedAt),
        replaySnapshots: data.replaySnapshots || [],
      });

      const saved = await result.save();

      // Gather participant profiles for ELO calculation
      const validParticipants = data.participants.filter(p => Types.ObjectId.isValid(p.userId));
      const profileMap = new Map<string, ProfileDocument>();

      for (const p of validParticipants) {
        const prof = await this.profileModel.findOne({ userId: new Types.ObjectId(p.userId) });
        if (prof) {
          profileMap.set(p.userId, prof);
        }
      }

      // Calculate multiplayer ELO adjustments
      const eloParticipants = validParticipants
        .filter(p => profileMap.has(p.userId))
        .map(p => ({
          userId: p.userId,
          rankPosition: p.rankPosition,
          currentElo: profileMap.get(p.userId)!.eloRating || 1000,
        }));

      const eloDeltas = this.calculateEloDeltas(eloParticipants, 32);

      // Update player profile statistics, progression, and ELO
      for (const p of data.participants) {
        if (Types.ObjectId.isValid(p.userId)) {
          const profile = profileMap.get(p.userId);
          if (profile) {
            profile.stats.totalRaces += 1;
            if (p.rankPosition === 1) {
              profile.stats.wins += 1;
            } else {
              profile.stats.losses += 1;
            }
            if (p.netWpm > profile.stats.bestWpm) {
              profile.stats.bestWpm = p.netWpm;
            }
            // Rolling average
            const prevRaces = profile.stats.totalRaces - 1;
            profile.stats.averageWpm = Math.round(
              (profile.stats.averageWpm * prevRaces + p.netWpm) / profile.stats.totalRaces,
            );
            profile.stats.averageAccuracy = Number(
              ((profile.stats.averageAccuracy * prevRaces + p.accuracy) / profile.stats.totalRaces).toFixed(1),
            );

            // Level & XP Progression
            const xpEarned = p.rankPosition === 1 ? 150 : Math.max(50, 100 - p.rankPosition * 10);
            profile.xp += xpEarned;
            profile.level = Math.floor(profile.xp / 500) + 1;

            // Apply ELO rating update
            const delta = eloDeltas.get(p.userId) || 0;
            profile.eloRating = Math.max(100, (profile.eloRating || 1000) + delta);
            profile.eloTier = this.getEloTier(profile.eloRating);

            // Unlock cars based on level progression
            if (!profile.unlockedCars) profile.unlockedCars = ['car_cyber_phantom'];
            for (const car of this.cars) {
              if (profile.level >= car.unlockLevel && !profile.unlockedCars.includes(car.id)) {
                profile.unlockedCars.push(car.id);
              }
            }

            // Rating / Rank Tier based on WPM milestones
            if (profile.stats.bestWpm >= 110) profile.rank = 'GRANDMASTER';
            else if (profile.stats.bestWpm >= 90) profile.rank = 'ELITE';
            else if (profile.stats.bestWpm >= 70) profile.rank = 'PRO';
            else if (profile.stats.bestWpm >= 50) profile.rank = 'RACER';
            else profile.rank = 'ROOKIE';

            await profile.save();
          }
        }
      }

      return saved;
    } catch (err: any) {
      this.logger.error(`Error saving race result: ${err.message}`);
      return null as any;
    }
  }

  async getRecentResults(limit: number = 20) {
    return this.raceResultModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getResultById(id: string) {
    return this.raceResultModel.findById(id).exec();
  }

  async getUserRaceHistory(userId: string, limit: number = 20) {
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.raceResultModel
      .find({ 'participants.userId': new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }
}
