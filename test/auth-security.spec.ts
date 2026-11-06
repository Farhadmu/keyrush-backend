import { AuthService } from '../src/auth/auth.service';
import { UnauthorizedException, ForbiddenException, ConflictException } from '@nestjs/common';

describe('Phase 1 & 12: Authentication & Security Integrity Tests', () => {
  let authService: AuthService;
  let userModel: any;
  let profileModel: any;
  let sessionModel: any;
  let jwtService: any;
  let auditService: any;

  beforeEach(() => {
    userModel = {
      findOne: jest.fn(),
      findById: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({}),
      save: jest.fn(),
    };
    profileModel = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    sessionModel = {
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }) }),
      updateOne: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({}),
    };
    jwtService = {
      sign: jest.fn().mockReturnValue('mock_jwt_token_2026'),
      verify: jest.fn(),
    };
    auditService = {
      logAction: jest.fn().mockResolvedValue({}),
    };

    authService = new AuthService(
      userModel as any,
      profileModel as any,
      sessionModel as any,
      jwtService,
      auditService,
    );
  });

  it('Argon2id hashes password and successfully verifies it', async () => {
    const rawPass = 'SuperSecureP@ss2026!';
    const hash = await authService.hashPassword(rawPass);

    expect(hash).toContain('$argon2id$');
    const isMatch = await authService.verifyPassword(rawPass, hash);
    expect(isMatch).toBe(true);

    const isWrong = await authService.verifyPassword('WrongPass123', hash);
    expect(isWrong).toBe(false);
  });

  it('Rejects invalid email/password login attempts', async () => {
    userModel.findOne.mockResolvedValue(null);

    await expect(
      authService.login({ email: 'unknown@keyrush.gg', password: 'Password123' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('Locks account after 5 consecutive failed login attempts', async () => {
    const userDoc: any = {
      _id: 'user_123',
      username: 'TargetUser',
      email: 'target@keyrush.gg',
      passwordHash: await authService.hashPassword('CorrectPassword123'),
      failedLoginAttempts: 4,
      lockUntil: null,
      status: 'ACTIVE',
      save: jest.fn().mockResolvedValue(true),
    };
    userModel.findOne.mockResolvedValue(userDoc);

    await expect(
      authService.login({ email: 'target@keyrush.gg', password: 'IncorrectPassword' }),
    ).rejects.toThrow(ForbiddenException);

    expect(userDoc.failedLoginAttempts).toBe(5);
    expect(userDoc.lockUntil).toBeDefined();
    expect(auditService.logAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'AUTH_ACCOUNT_LOCKED' }),
    );
  });

  it('Blocks login if user account is suspended or banned', async () => {
    const suspendedUser = {
      _id: 'user_banned',
      email: 'banned@keyrush.gg',
      status: 'BANNED',
      passwordHash: await authService.hashPassword('Pass123'),
    };
    userModel.findOne.mockResolvedValue(suspendedUser);

    await expect(
      authService.login({ email: 'banned@keyrush.gg', password: 'Pass123' }),
    ).rejects.toThrow(ForbiddenException);
  });
});
