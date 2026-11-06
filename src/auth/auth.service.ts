import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as argon2 from '@node-rs/argon2';
import * as crypto from 'crypto';
import { User, UserDocument, UserRole, UserStatus } from '../users/schemas/user.schema';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';
import { Session, SessionDocument } from './schemas/session.schema';
import { AuditService } from '../common/audit/audit.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
    @InjectModel(Session.name) private sessionModel: Model<SessionDocument>,
    private jwtService: JwtService,
    private auditService: AuditService,
  ) {}

  // -------------------------------------------------------------
  // Password Hashing & Verification (Argon2id + Legacy scrypt fallback)
  // -------------------------------------------------------------
  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, {
      memoryCost: 19456,
      timeCost: 2,
      outputLen: 32,
      parallelism: 1,
    });
  }

  async verifyPassword(password: string, storedHash: string, user?: UserDocument): Promise<boolean> {
    if (!storedHash) return false;

    // Standard Argon2id
    if (storedHash.startsWith('$argon2')) {
      try {
        return await argon2.verify(storedHash, password);
      } catch (e) {
        return false;
      }
    }

    // Legacy scrypt fallback (salt:hash format)
    const [salt, key] = storedHash.split(':');
    if (!salt || !key) return false;

    const testHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const isMatch = crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(testHash, 'hex'));

    // Transparently upgrade legacy scrypt hash to Argon2id on successful verification
    if (isMatch && user) {
      try {
        const upgradedHash = await this.hashPassword(password);
        user.passwordHash = upgradedHash;
        await user.save();
        this.logger.log(`Transparently upgraded user ${user.username} password to Argon2id`);
      } catch (err: any) {
        this.logger.warn(`Failed to upgrade password hash: ${err.message}`);
      }
    }

    return isMatch;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // -------------------------------------------------------------
  // Registration Workflow
  // -------------------------------------------------------------
  async register(
    dto: RegisterDto,
    metadata: { ip?: string; userAgent?: string } = {},
  ) {
    const existingUser = await this.userModel.findOne({
      $or: [{ email: dto.email.toLowerCase() }, { username: dto.username }],
    });

    if (existingUser) {
      if (existingUser.email === dto.email.toLowerCase()) {
        throw new ConflictException('Email already registered');
      }
      throw new ConflictException('Username is already taken');
    }

    const passwordHash = await this.hashPassword(dto.password);
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = new this.userModel({
      username: dto.username,
      email: dto.email.toLowerCase(),
      passwordHash,
      country: dto.country || 'BD',
      languagePreference: dto.languagePreference || 'EN',
      roles: [UserRole.PLAYER],
      status: UserStatus.ACTIVE,
      isEmailVerified: false,
      emailVerificationToken,
      emailVerificationExpires,
      lastLoginAt: new Date(),
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

    const tokens = await this.generateAndStoreTokens(user, metadata);

    await this.auditService.logAction({
      actorId: user._id.toString(),
      actorUsername: user.username,
      action: 'AUTH_REGISTER',
      resource: 'USER',
      resourceId: user._id.toString(),
      details: { email: user.email, country: user.country },
      ipAddress: metadata.ip,
      userAgent: metadata.userAgent,
    });

    return {
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        country: user.country,
        isEmailVerified: user.isEmailVerified,
      },
      profile,
      verificationToken: emailVerificationToken, // Provided for direct verification in local/dev
      ...tokens,
    };
  }

  // -------------------------------------------------------------
  // Login Workflow with Lockout Protection & Session Tracking
  // -------------------------------------------------------------
  async login(
    dto: LoginDto & { twoFactorCode?: string },
    metadata: { ip?: string; userAgent?: string } = {},
  ) {
    const user = await this.userModel.findOne({ email: dto.email.toLowerCase() });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Account lockout protection
    if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
      const waitMinutes = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account temporarily locked due to excessive failed attempts. Please retry in ${waitMinutes} minute(s).`,
      );
    }

    // Account status check
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Your account has been suspended. Please contact support.');
    }
    if (user.status === UserStatus.BANNED) {
      throw new ForbiddenException('Your account has been permanently banned for fair-play violations.');
    }

    const isMatch = await this.verifyPassword(dto.password, user.passwordHash, user);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); // 15-minute lock
        await user.save();
        await this.auditService.logAction({
          actorId: user._id.toString(),
          actorUsername: user.username,
          action: 'AUTH_ACCOUNT_LOCKED',
          resource: 'USER',
          resourceId: user._id.toString(),
          details: { failedAttempts: user.failedLoginAttempts },
          ipAddress: metadata.ip,
          userAgent: metadata.userAgent,
        });
        throw new ForbiddenException('Too many failed attempts. Account locked for 15 minutes.');
      }
      await user.save();
      throw new UnauthorizedException('Invalid email or password');
    }

    // Handle 2FA verification if enabled
    if (user.twoFactorEnabled) {
      if (!dto.twoFactorCode) {
        return {
          requires2Fa: true,
          userId: user._id,
          message: 'Two-factor authentication code required.',
        };
      }
      const isValid2Fa = this.verifyTotpCode(user.twoFactorSecret, dto.twoFactorCode, user.twoFactorBackupCodes);
      if (!isValid2Fa) {
        throw new UnauthorizedException('Invalid two-factor authentication code or backup code.');
      }
    }

    // Reset login failures on success
    user.failedLoginAttempts = 0;
    user.lockUntil = null as any;
    user.lastLoginAt = new Date();
    await user.save();

    const profile = await this.profileModel.findOne({ userId: user._id });
    const tokens = await this.generateAndStoreTokens(user, metadata);

    await this.auditService.logAction({
      actorId: user._id.toString(),
      actorUsername: user.username,
      action: 'AUTH_LOGIN',
      resource: 'USER',
      resourceId: user._id.toString(),
      ipAddress: metadata.ip,
      userAgent: metadata.userAgent,
    });

    return {
      success: true,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        roles: user.roles,
        country: user.country,
        isEmailVerified: user.isEmailVerified,
      },
      profile,
      ...tokens,
    };
  }

  // -------------------------------------------------------------
  // Refresh Token Rotation & Reuse Detection
  // -------------------------------------------------------------
  async refreshTokens(
    refreshToken: string,
    metadata: { ip?: string; userAgent?: string } = {},
  ) {
    if (!refreshToken) throw new UnauthorizedException('Refresh token is required');

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET || 'keyrush_refresh_secret_key_2026',
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const hashedToken = this.hashToken(refreshToken);
    const existingSession = await this.sessionModel.findOne({
      userId: payload.sub,
      refreshTokenHash: hashedToken,
    });

    // Reuse detection: If token exists but is already revoked, an adversary may have stolen it!
    if (existingSession && existingSession.isRevoked) {
      this.logger.warn(`Refresh token reuse detected for user ${payload.sub}! Revoking all sessions.`);
      await this.sessionModel.updateMany({ userId: payload.sub }, { isRevoked: true });
      await this.auditService.logAction({
        actorId: payload.sub,
        actorUsername: payload.username || 'UNKNOWN',
        action: 'AUTH_TOKEN_REUSE_DETECTED',
        resource: 'SESSION',
        details: { revokedSessionId: existingSession._id },
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
      });
      throw new UnauthorizedException('Security alert: Refresh token reuse detected. All sessions terminated.');
    }

    if (!existingSession || existingSession.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Session expired or not found. Please log in again.');
    }

    // Revoke old session and issue new token pair (Token Rotation)
    existingSession.isRevoked = true;
    await existingSession.save();

    const user = await this.userModel.findById(payload.sub);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account no longer active.');
    }

    const newTokens = await this.generateAndStoreTokens(user, metadata);
    return newTokens;
  }

  // -------------------------------------------------------------
  // Session & Logout Management
  // -------------------------------------------------------------
  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      const hashed = this.hashToken(refreshToken);
      await this.sessionModel.updateOne({ userId, refreshTokenHash: hashed }, { isRevoked: true });
    }
    await this.auditService.logAction({
      actorId: userId,
      action: 'AUTH_LOGOUT',
      resource: 'SESSION',
    });
    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAll(userId: string) {
    await this.sessionModel.updateMany({ userId }, { isRevoked: true });
    await this.auditService.logAction({
      actorId: userId,
      action: 'AUTH_LOGOUT_ALL',
      resource: 'SESSION',
    });
    return { success: true, message: 'Logged out from all active sessions' };
  }

  async getActiveSessions(userId: string) {
    return this.sessionModel
      .find({ userId, isRevoked: false, expiresAt: { $gt: new Date() } })
      .select('-refreshTokenHash')
      .sort({ lastActiveAt: -1 })
      .exec();
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.sessionModel.findOne({ _id: sessionId, userId });
    if (!session) throw new NotFoundException('Session not found');
    session.isRevoked = true;
    await session.save();
    return { success: true, message: 'Session revoked successfully' };
  }

  // -------------------------------------------------------------
  // Email Verification Workflow
  // -------------------------------------------------------------
  async verifyEmail(token: string) {
    const user = await this.userModel.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired email verification token.');
    }
    user.isEmailVerified = true;
    user.emailVerificationToken = null as any;
    user.emailVerificationExpires = null as any;
    await user.save();

    await this.auditService.logAction({
      actorId: user._id.toString(),
      actorUsername: user.username,
      action: 'AUTH_EMAIL_VERIFIED',
      resource: 'USER',
      resourceId: user._id.toString(),
    });

    return { success: true, message: 'Email verified successfully!' };
  }

  async resendVerificationEmail(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (user.isEmailVerified) throw new BadRequestException('Email already verified');

    const token = crypto.randomBytes(32).toString('hex');
    user.emailVerificationToken = token;
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    return { success: true, verificationToken: token, message: 'Verification token generated' };
  }

  // -------------------------------------------------------------
  // Password Reset Workflow
  // -------------------------------------------------------------
  async forgotPassword(email: string) {
    const user = await this.userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Prevent user enumeration: always return success
      return { success: true, message: 'If an account exists, a password reset token has been issued.' };
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = resetToken;
    user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await user.save();

    await this.auditService.logAction({
      actorId: user._id.toString(),
      actorUsername: user.username,
      action: 'AUTH_FORGOT_PASSWORD_REQUEST',
      resource: 'USER',
      resourceId: user._id.toString(),
    });

    return {
      success: true,
      resetToken, // Returned for dev/testing environment
      message: 'Password reset token generated successfully.',
    };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    const user = await this.userModel.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired password reset token');
    }

    user.passwordHash = await this.hashPassword(newPassword);
    user.passwordResetToken = null as any;
    user.passwordResetExpires = null as any;
    user.failedLoginAttempts = 0;
    user.lockUntil = null as any;
    await user.save();

    // Revoke all existing sessions for security
    await this.sessionModel.updateMany({ userId: user._id }, { isRevoked: true });

    await this.auditService.logAction({
      actorId: user._id.toString(),
      actorUsername: user.username,
      action: 'AUTH_PASSWORD_RESET_COMPLETE',
      resource: 'USER',
      resourceId: user._id.toString(),
    });

    return { success: true, message: 'Password has been reset successfully. Please log in.' };
  }

  // -------------------------------------------------------------
  // Optional Two-Factor Authentication (2FA)
  // -------------------------------------------------------------
  async setup2Fa(userId: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const secret = crypto.randomBytes(20).toString('hex');
    const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(4).toString('hex').toUpperCase());

    user.twoFactorSecret = secret;
    user.twoFactorBackupCodes = backupCodes;
    await user.save();

    return {
      success: true,
      secret,
      backupCodes,
      otpAuthUrl: `otpauth://totp/KEYRUSH:${user.email}?secret=${secret}&issuer=KEYRUSH`,
    };
  }

  async enable2Fa(userId: string, code: string) {
    const user = await this.userModel.findById(userId);
    if (!user || !user.twoFactorSecret) throw new BadRequestException('2FA setup not initiated');

    const isValid = this.verifyTotpCode(user.twoFactorSecret, code, []);
    if (!isValid) throw new BadRequestException('Invalid authentication code');

    user.twoFactorEnabled = true;
    await user.save();

    return { success: true, message: 'Two-factor authentication enabled successfully!' };
  }

  async disable2Fa(userId: string, password: string) {
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const isMatch = await this.verifyPassword(password, user.passwordHash, user);
    if (!isMatch) throw new UnauthorizedException('Invalid password');

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null as any;
    user.twoFactorBackupCodes = [];
    await user.save();

    return { success: true, message: 'Two-factor authentication disabled' };
  }

  private verifyTotpCode(secret: string, code: string, backupCodes: string[]): boolean {
    if (!secret && (!backupCodes || backupCodes.length === 0)) return false;

    // Check backup codes
    if (backupCodes && backupCodes.includes(code.toUpperCase())) {
      return true;
    }

    // Simple time-step verification algorithm (HMAC-SHA1 30s window)
    try {
      const timeStep = Math.floor(Date.now() / 1000 / 30);
      for (let delta = -1; delta <= 1; delta++) {
        const step = timeStep + delta;
        const buffer = Buffer.alloc(8);
        buffer.writeBigInt64BE(BigInt(step));
        const hmac = crypto.createHmac('sha1', Buffer.from(secret, 'hex')).update(buffer).digest();
        const offset = hmac[hmac.length - 1] & 0xf;
        const binaryCode =
          ((hmac[offset] & 0x7f) << 24) |
          ((hmac[offset + 1] & 0xff) << 16) |
          ((hmac[offset + 2] & 0xff) << 8) |
          (hmac[offset + 3] & 0xff);
        const expectedCode = (binaryCode % 1000000).toString().padStart(6, '0');
        if (code === expectedCode) return true;
      }
    } catch (e) {
      return false;
    }
    return false;
  }

  // -------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------
  async validateUserById(userId: string) {
    const user = await this.userModel.findById(userId).select('-passwordHash');
    if (!user) throw new UnauthorizedException('User not found');
    const profile = await this.profileModel.findOne({ userId: user._id });
    return { user, profile };
  }

  private async generateAndStoreTokens(
    user: UserDocument,
    metadata: { ip?: string; userAgent?: string } = {},
  ) {
    const payload = {
      sub: user._id.toString(),
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

    const hashedRefreshToken = this.hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = new this.sessionModel({
      userId: user._id,
      refreshTokenHash: hashedRefreshToken,
      userAgent: metadata.userAgent || 'Unknown Browser',
      ipAddress: metadata.ip || '127.0.0.1',
      expiresAt,
      lastActiveAt: new Date(),
    });
    await session.save();

    return {
      accessToken,
      refreshToken,
      sessionId: session._id,
      expiresIn: 900, // 15 mins in seconds
    };
  }
}
