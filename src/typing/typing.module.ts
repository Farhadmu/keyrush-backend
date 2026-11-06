import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypingService } from './typing.service';
import { TypingController } from './typing.controller';
import { TypingPassage, TypingPassageSchema } from './schemas/passage.schema';
import { TypingResult, TypingResultSchema } from './schemas/typing-result.schema';
import { Profile, ProfileSchema } from '../users/schemas/profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TypingPassage.name, schema: TypingPassageSchema },
      { name: TypingResult.name, schema: TypingResultSchema },
      { name: Profile.name, schema: ProfileSchema },
    ]),
  ],
  controllers: [TypingController],
  providers: [TypingService],
  exports: [TypingService],
})
export class TypingModule {}
