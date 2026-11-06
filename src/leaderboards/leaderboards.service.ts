import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

@Injectable()
export class LeaderboardsService {
  constructor(
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async getGlobalLeaderboard(limit: number = 50) {
    const profiles = await this.profileModel
      .find({ 'stats.totalRaces': { $gt: 0 } })
      .populate('userId', 'username country languagePreference')
      .sort({ 'stats.bestWpm': -1, 'stats.averageAccuracy': -1 })
      .limit(limit);

    return profiles.map((p, index) => {
      const user = p.userId as any;
      const winRate = p.stats.totalRaces > 0
        ? Math.round((p.stats.wins / p.stats.totalRaces) * 100)
        : 0;

      return {
        rank: index + 1,
        username: user?.username || p.displayName || 'Racer',
        country: user?.country || 'BD',
        level: p.level,
        rankTier: p.rank,
        eloRating: p.eloRating || 1000,
        eloTier: p.eloTier || 'BRONZE',
        bestWpm: p.stats.bestWpm,
        averageWpm: p.stats.averageWpm,
        accuracy: p.stats.averageAccuracy,
        totalRaces: p.stats.totalRaces,
        wins: p.stats.wins,
        winRate,
        selectedCarId: p.selectedCarId,
      };
    });
  }

  async getRankedLeaderboard(limit: number = 50) {
    const profiles = await this.profileModel
      .find()
      .populate('userId', 'username country languagePreference')
      .sort({ eloRating: -1, 'stats.wins': -1 })
      .limit(limit);

    return profiles.map((p, index) => {
      const user = p.userId as any;
      const winRate = p.stats.totalRaces > 0
        ? Math.round((p.stats.wins / p.stats.totalRaces) * 100)
        : 0;

      return {
        rank: index + 1,
        username: user?.username || p.displayName || 'Racer',
        country: user?.country || 'BD',
        level: p.level,
        eloRating: p.eloRating || 1000,
        eloTier: p.eloTier || 'BRONZE',
        bestWpm: p.stats.bestWpm,
        averageWpm: p.stats.averageWpm,
        accuracy: p.stats.averageAccuracy,
        totalRaces: p.stats.totalRaces,
        wins: p.stats.wins,
        winRate,
        selectedCarId: p.selectedCarId,
      };
    });
  }

  async getCountryLeaderboard(country: string = 'BD', limit: number = 50) {
    const usersInCountry = await this.userModel.find({ country }).select('_id');
    const userIds = usersInCountry.map(u => u._id);

    const profiles = await this.profileModel
      .find({ userId: { $in: userIds }, 'stats.totalRaces': { $gt: 0 } })
      .populate('userId', 'username country')
      .sort({ 'stats.bestWpm': -1 })
      .limit(limit);

    return profiles.map((p, index) => ({
      rank: index + 1,
      username: (p.userId as any)?.username || p.displayName,
      country,
      bestWpm: p.stats.bestWpm,
      averageWpm: p.stats.averageWpm,
      accuracy: p.stats.averageAccuracy,
      wins: p.stats.wins,
    }));
  }
}
