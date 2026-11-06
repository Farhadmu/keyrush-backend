import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: () => {
        const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/keyrush';
        const isProd = process.env.NODE_ENV === 'production';

        return {
          uri,
          connectionErrorFactory: (error) => {
            console.warn(`[Database] MongoDB connection notification: ${error.message}`);
            return error;
          },
          retryAttempts: isProd ? 5 : 2,
          retryDelay: 2000,
          serverSelectionTimeoutMS: isProd ? 10000 : 3000,
        };
      },
    }),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
