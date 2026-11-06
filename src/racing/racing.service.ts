import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { RaceResult, RaceResultDocument } from './schemas/race-result.schema';
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
  ];

  constructor(
    @InjectModel(RaceResult.name) private readonly raceResultModel: Model<RaceResultDocument>,
    @InjectModel(Profile.name) private readonly profileModel: Model<ProfileDocument>,
  ) {}

  getCars(): CarCatalogItem[] {
    return this.cars;
  }

  getCarById(id: string): CarCatalogItem {
    return this.cars.find(c => c.id === id) || this.cars[0];
  }

  // Authoritative vehicle speed formula
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

      // Update player profile statistics
      for (const p of data.participants) {
        if (Types.ObjectId.isValid(p.userId)) {
          const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(p.userId) });
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

            // Rating / Rank Tier
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
