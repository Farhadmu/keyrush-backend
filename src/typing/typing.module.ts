import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TypingService } from './typing.service';
import { TypingController } from './typing.controller';
import { TypingPassage, TypingPassageSchema } from './schemas/passage.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TypingPassage.name, schema: TypingPassageSchema },
    ]),
  ],
  controllers: [TypingController],
  providers: [TypingService],
  exports: [TypingService],
})
export class TypingModule {}
