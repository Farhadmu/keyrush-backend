import { Injectable, NotFoundException, BadRequestException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as argon2 from '@node-rs/argon2';
import { User, UserDocument, UserStatus } from './schemas/user.schema';
import { Profile, ProfileDocument } from './schemas/profile.schema';
import { UserRole } from '../auth/roles.enum';

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
  ) {}

  async onModuleInit() {
    await this.seedDefaultRoles();
  }

  async seedDefaultRoles() {
    const defaultAccounts = [
      {
        username: 'superadmin',
        email: 'admin@keyrush.io',
        password: process.env.ADMIN_DEFAULT_PASSWORD || 'AdminKeyrush2026!',
        roles: [UserRole.SUPER_ADMIN],
        displayName: 'KEYRUSH Master Admin',
        rank: 'GRANDMASTER',
        level: 50,
      },
      {
        username: 'organizer',
        email: 'organizer@keyrush.io',
        password: process.env.ORGANIZER_DEFAULT_PASSWORD || 'OrganizerKeyrush2026!',
        roles: [UserRole.ORGANIZER],
        displayName: 'Official Event Organizer',
        rank: 'PRO',
        level: 25,
      },
      {
        username: 'pro_player',
        email: 'player@keyrush.io',
        password: process.env.PLAYER_DEFAULT_PASSWORD || 'PlayerKeyrush2026!',
        roles: [UserRole.USER],
        displayName: 'Pro Racer Alpha',
        rank: 'ROOKIE',
        level: 10,
      },
    ];

    for (const acc of defaultAccounts) {
      try {
        const existing = await this.userModel.findOne({
          $or: [{ email: acc.email.toLowerCase() }, { username: acc.username }],
        });

        if (!existing) {
          const passwordHash = await argon2.hash(acc.password, {
            memoryCost: 19456,
            timeCost: 2,
            outputLen: 32,
            parallelism: 1,
          });

          const user = new this.userModel({
            username: acc.username,
            email: acc.email.toLowerCase(),
            passwordHash,
            country: 'BD',
            languagePreference: 'EN',
            roles: acc.roles,
            status: UserStatus.ACTIVE,
            isEmailVerified: true,
            lastLoginAt: new Date(),
          });
          await user.save();

          await this.profileModel.findOneAndUpdate(
            { userId: user._id },
            {
              $setOnInsert: {
                userId: user._id,
                displayName: acc.displayName,
                rank: acc.rank,
                level: acc.level,
                xp: acc.level * 1000,
                selectedCarId: 'car_cyber_phantom',
                stats: {
                  totalRaces: 0,
                  wins: 0,
                  losses: 0,
                  bestWpm: 0,
                  averageWpm: 0,
                  averageAccuracy: 0,
                  totalPracticeTimeMs: 0,
                },
              },
            },
            { upsert: true },
          );

          this.logger.log(`Seeded default role account: ${acc.email} (${acc.roles.join(', ')})`);
        } else {
          const missingRole = acc.roles.some((r) => !existing.roles.includes(r));
          if (missingRole) {
            existing.roles = Array.from(new Set([...existing.roles, ...acc.roles]));
            await existing.save();
            this.logger.log(`Updated roles for existing account: ${acc.email} -> ${existing.roles.join(', ')}`);
          }
        }
      } catch (err: any) {
        this.logger.warn(`Could not seed role account ${acc.username}: ${err.message}`);
      }
    }
  }

  async getProfileByUsername(username: string) {
    const user = await this.userModel.findOne({ username }).select('-passwordHash');
    if (!user) throw new NotFoundException('Player not found');
    const profile = await this.profileModel.findOne({ userId: user._id });
    return { user, profile };
  }

  async getProfileByUserId(userId: string) {
    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user) throw new NotFoundException('User not found');
    const profile = await this.profileModel.findOne({ userId: user._id });
    return { user, profile };
  }

  async updateProfile(
    userId: string,
    data: {
      displayName?: string;
      bio?: string;
      avatarUrl?: string;
      country?: string;
      languagePreference?: string;
      selectedCarId?: string;
    },
  ) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    if (data.country) user.country = data.country;
    if (data.languagePreference) user.languagePreference = data.languagePreference;
    await user.save();

    const updateFields: any = {};
    if (data.displayName !== undefined) updateFields.displayName = data.displayName;
    if (data.bio !== undefined) updateFields.bio = data.bio;
    if (data.avatarUrl !== undefined) updateFields.avatarUrl = data.avatarUrl;
    if (data.selectedCarId !== undefined) updateFields.selectedCarId = data.selectedCarId;

    const profile = await this.profileModel.findOneAndUpdate(
      { userId: user._id },
      { $set: updateFields },
      { new: true },
    );

    return { user: user.toObject(), profile };
  }

  async updateCarSelection(userId: string, carId: string) {
    const profile = await this.profileModel.findOneAndUpdate(
      { userId: new Types.ObjectId(userId) },
      { selectedCarId: carId },
      { new: true },
    );
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  // Admin User Management
  async getAllUsers(options: { search?: string; role?: string; status?: string; limit?: number; page?: number }) {
    const query: any = {};
    if (options.search) {
      query.$or = [
        { username: { $regex: options.search, $options: 'i' } },
        { email: { $regex: options.search, $options: 'i' } },
      ];
    }
    if (options.role) query.roles = options.role;
    if (options.status) query.status = options.status;

    const limit = options.limit || 50;
    const page = options.page || 1;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel.find(query).select('-passwordHash').skip(skip).limit(limit).sort({ createdAt: -1 }),
      this.userModel.countDocuments(query),
    ]);

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateUserStatus(userId: string, status: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.status = status;
    return user.save();
  }

  async updateUserRoles(userId: string, roles: string[]) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    user.roles = roles;
    return user.save();
  }
}
