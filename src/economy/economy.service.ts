import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BattlePass, BattlePassDocument } from './schemas/battle-pass.schema';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';

export interface BattlePassTierDefinition {
  level: number;
  xpRequired: number;
  freeReward: { type: string; name: string; value: string };
  proReward: { type: string; name: string; value: string };
}

@Injectable()
export class EconomyService {
  private readonly logger = new Logger(EconomyService.name);

  // 50 Tiers for Season 1
  private readonly tiers: BattlePassTierDefinition[] = Array.from({ length: 50 }, (_, i) => {
    const level = i + 1;
    let freeReward = { type: 'XP_BOOST', name: '100 Bonus XP', value: '100' };
    let proReward = { type: 'COSMETIC', name: 'Cyber Neon Finish', value: 'finish_chrome' };

    if (level === 10) {
      freeReward = { type: 'COSMETIC', name: 'Sport Lip Spoiler', value: 'spoiler_sport' };
      proReward = { type: 'COSMETIC', name: 'Solaris Gold Livery', value: 'color_gold' };
    } else if (level === 25) {
      freeReward = { type: 'XP_BOOST', name: '500 Bonus XP', value: '500' };
      proReward = { type: 'COSMETIC', name: 'Cyber Split Aero Wing', value: 'spoiler_cyber' };
    } else if (level === 50) {
      freeReward = { type: 'COSMETIC', name: 'Grand Champion Neon Underglow', value: 'neon_emerald' };
      proReward = { type: 'CAR_UNLOCK', name: 'Vortex GT Esports Special Edition', value: 'car_vortex_gt' };
    }

    return {
      level,
      xpRequired: level * 250,
      freeReward,
      proReward,
    };
  });

  constructor(
    @InjectModel(BattlePass.name) private readonly battlePassModel: Model<BattlePassDocument>,
    @InjectModel(Profile.name) private readonly profileModel: Model<ProfileDocument>,
  ) {}

  async getBattlePass(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid user ID');
    }

    let pass = await this.battlePassModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!pass) {
      pass = await this.battlePassModel.create({
        userId: new Types.ObjectId(userId),
        season: 1,
        tier: 'FREE',
        currentLevel: 1,
        seasonXp: 0,
        claimedTiers: [],
      });
    }

    // Sync pass level with player's profile XP
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(userId) });
    if (profile) {
      const calculatedLevel = Math.min(50, Math.floor((profile.xp || 0) / 250) + 1);
      if (calculatedLevel > pass.currentLevel) {
        pass.currentLevel = calculatedLevel;
        pass.seasonXp = profile.xp || 0;
        await pass.save();
      }
    }

    return {
      pass,
      tiers: this.tiers,
    };
  }

  async claimTierReward(userId: string, tierLevel: number) {
    if (!Types.ObjectId.isValid(userId)) throw new BadRequestException('Invalid user ID');
    if (tierLevel < 1 || tierLevel > 50) throw new BadRequestException('Invalid tier level');

    const pass = await this.battlePassModel.findOne({ userId: new Types.ObjectId(userId) });
    if (!pass) throw new NotFoundException('Battle pass not found');

    if (tierLevel > pass.currentLevel) {
      throw new BadRequestException(`Tier level ${tierLevel} is not unlocked yet. Current level: ${pass.currentLevel}`);
    }

    if (pass.claimedTiers.includes(tierLevel)) {
      throw new BadRequestException(`Reward for tier ${tierLevel} has already been claimed.`);
    }

    const tierDef = this.tiers[tierLevel - 1];
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(userId) });

    // Apply rewards
    if (profile) {
      // Free Reward
      if (tierDef.freeReward.type === 'XP_BOOST') {
        profile.xp += parseInt(tierDef.freeReward.value, 10);
      }

      // Pro Reward (if user purchased Pro pass)
      if (pass.tier === 'PRO') {
        if (tierDef.proReward.type === 'CAR_UNLOCK') {
          if (!profile.unlockedCars.includes(tierDef.proReward.value)) {
            profile.unlockedCars.push(tierDef.proReward.value);
          }
        }
      }

      await profile.save();
    }

    pass.claimedTiers.push(tierLevel);
    await pass.save();

    return {
      message: `Tier ${tierLevel} reward claimed successfully!`,
      claimedReward: pass.tier === 'PRO' ? tierDef.proReward : tierDef.freeReward,
      pass,
    };
  }

  // Idempotent Payment Webhook Processor (Stripe, bKash, SSLCommerz sandbox)
  async processPaymentWebhook(payload: {
    transactionId: string;
    provider: string;
    userId: string;
    tier: string;
    amount: number;
    signature?: string;
  }) {
    if (!payload.transactionId || !payload.userId) {
      throw new BadRequestException('Missing transactionId or userId');
    }

    // Idempotency: verify if this transactionId has already been completed
    const existing = await this.battlePassModel.findOne({ transactionId: payload.transactionId });
    if (existing) {
      this.logger.warn(`Duplicate webhook received for transactionId: ${payload.transactionId}`);
      return {
        status: 'IDEMPOTENT_IGNORED',
        message: 'Transaction already applied',
        pass: existing,
      };
    }

    if (!Types.ObjectId.isValid(payload.userId)) {
      throw new BadRequestException('Invalid user ID in transaction');
    }

    const pass = await this.battlePassModel.findOneAndUpdate(
      { userId: new Types.ObjectId(payload.userId) },
      {
        $set: {
          tier: 'PRO',
          purchasedAt: new Date(),
          paymentProvider: payload.provider || 'STRIPE_SANDBOX',
          transactionId: payload.transactionId,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    // Auto unlock instant Pro bonus car
    const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(payload.userId) });
    if (profile) {
      if (!profile.unlockedCars.includes('car_titan_apex')) {
        profile.unlockedCars.push('car_titan_apex');
      }
      await profile.save();
    }

    this.logger.log(`Battle Pass Pro activated for user: ${payload.userId} (TX: ${payload.transactionId})`);

    return {
      status: 'SUCCESS',
      message: 'Battle Pass Pro upgraded successfully',
      pass,
    };
  }
}

