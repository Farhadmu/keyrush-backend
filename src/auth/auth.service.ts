import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    private jwtService: JwtService,
  ) {}

  // Secure password hashing with salt using crypto scrypt / argon2
  private hashPassword(password: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(password: string, storedHash: string): boolean {
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;
    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(testHash, 'hex'));
  }

  async register(dto: RegisterDto) {
    const existingUser = await this.userModel.findOne({
      $or: [{ email: dto.email.toLowerCase() }, { username: dto.username }],
    });

    if (existingUser) {
      if (existingUser.email === dto.email.toLowerCase()) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = this.hashPassword(dto.password);
    const user = new this.userModel({
      username: dto.username,
      email: dto.email.toLowerCase(),
      passwordHash,
      country: dto.country || 'BD',
      languagePreference: dto.languagePreference || 'EN',
      roles: [UserRole.PLAYER],
    });
    await user.save();

    const profile = new this.profileModel({
      userId: user._id,
      displayName: dto.username,
      rank: 'ROOKIE',
      level: 1,
      xp: 0,
      stats: {
        totalRaces: 0,
        wins: 0,
        losses: 0,
        bestWpm: 0,
        averageWpm: 0,
        averageAccuracy: 0,
        totalPracticeTimeMs: 0,
      },
    });
    await profile.save();

    const tokens = this.generateTokens(user);
    return {
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        country: user.country,
      },
      profile,
      ...tokens,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = this.verifyPassword(dto.password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const profile = await this.profileModel.findOne({ userId: user._id });
    const tokens = this.generateTokens(user);

    return {
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        country: user.country,
      },
      profile,
      ...tokens,
    };
  }

  async validateUserById(userId: string) {
    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user) throw new UnauthorizedException('User not found');
    const profile = await this.profileModel.findOne({ userId: user._id });
    return { user, profile };
  }

  generateTokens(user: UserDocument) {
    const payload = {
      sub: user._id,
      username: user.username,
      roles: user.roles,
      organizationId: user.organizationId,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_EXPIRATION || '15m',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: process.env.JWT_REFRESH_SECRET || 'keyrush_refresh_secret_key_2026',
      expiresIn: process.env.JWT_REFRESH_EXPIRATION || '7d',
    });

    return { accessToken, refreshToken };
  }
}
