import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateEnvironment } from './common/config/env.validator';
import * as cookieParser from 'cookie-parser';

async function bootstrap() {
  // Validate environment secrets and infrastructure before app boot
  validateEnvironment();

  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.use(cookieParser());

  // Allow /health without api/v1 prefix for cloud load balancers and container monitors
  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  // Global exception filter for unified error response formatting and logging
  app.useGlobalFilters(new HttpExceptionFilter());

  // Configure CORS for production cloud frontend, Netlify, and local development
  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);

      const configured = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map(o => o.trim().replace(/\/$/, ''))
        .filter(Boolean);

      const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isNetlify = /\.netlify\.app$/.test(origin);
      const isRender = /\.onrender\.com$/.test(origin);
      const isConfigured = configured.includes('*') || configured.includes(origin);

      if (isLocalhost || isNetlify || isRender || isConfigured || configured.length === 0) {
        return callback(null, true);
      }

      logger.warn(`Blocked CORS request from origin: ${origin}`);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Enable validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );

  // Enable graceful shutdown hooks for cloud SIGTERM/SIGINT
  app.enableShutdownHooks();

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`🏎️ KEYRUSH Backend API listening on http://localhost:${port}/api/v1`);
  logger.log(`⚡ KEYRUSH WebSocket Gateway listening on ws://localhost:${port}/racing`);
  logger.log(`🩺 KEYRUSH Health Check available on http://localhost:${port}/health`);
}
bootstrap();
