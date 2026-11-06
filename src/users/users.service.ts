import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
import { Profile, ProfileDocument } from './schemas/profile.schema';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
  ) {}

  async getProfileByUsername(username: string) {
    const user = await this.userModel.findOne({ username }).select('-passwordHash');
    if (!user) throw new NotFoundException('Player not found');
    const profile = await this.profileModel.findOne({ userId: user._id });
    return { user, profile };
  }

  async updateCarSelection(userId: string, carId: string) {
    const profile = await this.profileModel.findOneAndUpdate(
      { userId },
      { selectedCarId: carId },
      { new: true },
    );
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async recordRaceStats(userId: string, stats: { wpm: number; accuracy: number; won: boolean; durationMs: number }) {
    const profile = await this.profileModel.findOne({ userId });
    if (!profile) return null;

    const currentStats = profile.stats || {
      totalRaces: 0,
      wins: 0,
      losses: 0,
      bestWpm: 0,
      averageWpm: 0,
      averageAccuracy: 0,
      totalPracticeTimeMs: 0,
    };

    const totalRaces = currentStats.totalRaces + 1;
    const wins = currentStats.wins + (stats.won ? 1 : 0);
    const losses = currentStats.losses + (stats.won ? 0 : 1);
    const bestWpm = Math.max(currentStats.bestWpm, stats.wpm);
    const averageWpm = Number(((currentStats.averageWpm * currentStats.totalRaces + stats.wpm) / totalRaces).toFixed(1));
    const averageAccuracy = Number(((currentStats.averageAccuracy * currentStats.totalRaces + stats.accuracy) / totalRaces).toFixed(1));
    const totalPracticeTimeMs = currentStats.totalPracticeTimeMs + stats.durationMs;

    // XP calculation: 100 XP base + WPM bonus + victory bonus
    const xpGained = Math.round(50 + stats.wpm * 1.5 + (stats.won ? 100 : 20));
    const newXp = profile.xp + xpGained;
    const newLevel = Math.floor(newXp / 500) + 1;

    profile.xp = newXp;
    profile.level = newLevel;
    profile.stats = {
      totalRaces,
      wins,
      losses,
      bestWpm,
      averageWpm,
      averageAccuracy,
      totalPracticeTimeMs,
    };

    return profile.save();
  }
}
