import { Module, Global } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiAnalysis, AiAnalysisSchema } from './schemas/ai-analysis.schema';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: AiAnalysis.name, schema: AiAnalysisSchema }]),
  ],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}

