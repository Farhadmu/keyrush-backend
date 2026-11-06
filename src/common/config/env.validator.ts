import { Logger } from '@nestjs/common';

export function validateEnvironment(): void {
  const logger = new Logger('EnvironmentValidator');
  const isProduction = process.env.NODE_ENV === 'production';

  const jwtSecret = process.env.JWT_SECRET;
  const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
  const mongoUri = process.env.MONGODB_URI;
  const redisHost = process.env.REDIS_HOST;
  const redisUrl = process.env.REDIS_URL;

  if (isProduction) {
    logger.log('🔒 Validating strict production environment requirements...');

    if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.includes('change_me') || jwtSecret.includes('dev_key')) {
      logger.error('CRITICAL: JWT_SECRET is missing, insecure, or shorter than 32 characters in production!');
      throw new Error('Startup failed: Insecure or missing JWT_SECRET in production environment.');
    }

    if (!jwtRefreshSecret || jwtRefreshSecret.length < 32 || jwtRefreshSecret.includes('change_me') || jwtRefreshSecret.includes('dev_key')) {
      logger.error('CRITICAL: JWT_REFRESH_SECRET is missing, insecure, or shorter than 32 characters in production!');
      throw new Error('Startup failed: Insecure or missing JWT_REFRESH_SECRET in production environment.');
    }

    if (jwtSecret === jwtRefreshSecret) {
      logger.error('CRITICAL: JWT_SECRET and JWT_REFRESH_SECRET must not be identical!');
      throw new Error('Startup failed: JWT_SECRET and JWT_REFRESH_SECRET must be distinct secrets.');
    }

    if (!mongoUri) {
      logger.error('CRITICAL: MONGODB_URI is required in production!');
      throw new Error('Startup failed: MONGODB_URI is required in production.');
    }

    if (!redisHost && !redisUrl) {
      logger.error('CRITICAL: REDIS_URL or REDIS_HOST is mandatory for distributed multiplayer in production!');
      throw new Error('Startup failed: Redis configuration is mandatory in production environment.');
    }

    logger.log('✅ Production environment secrets and infrastructure verified.');
  } else {
    // Non-production warning if default keys are used
    if (!jwtSecret) {
      logger.warn('[DEV NOTICE] JWT_SECRET not configured. Using temporary dev secret.');
    }
    if (!jwtRefreshSecret) {
      logger.warn('[DEV NOTICE] JWT_REFRESH_SECRET not configured. Using temporary dev secret.');
    }
  }
}

