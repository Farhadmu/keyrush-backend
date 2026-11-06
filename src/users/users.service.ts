import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument, UserStatus } from './schemas/user.schema';
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
