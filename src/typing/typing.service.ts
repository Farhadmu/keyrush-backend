import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TypingPassage, TypingPassageDocument } from './schemas/passage.schema';

export interface ScoreCalculationResult {
  rawWpm: number;
  netWpm: number;
  accuracy: number;
  correctCharacters: number;
  incorrectCharacters: number;
  totalCharacters: number;
  elapsedSeconds: number;
}

@Injectable()
export class TypingService implements OnModuleInit {
  private fallbackPassages: Partial<TypingPassage>[] = [
    {
      title: 'Neon Horizon Circuit',
      content: 'The cybernetic engine roared as high-voltage currents surged through the carbon fiber chassis. Every keystroke fired the ignition cylinders into hyper-drive.',
      language: 'EN',
      difficulty: 'MEDIUM',
      wordCount: 23,
      category: 'CYBERPUNK',
    },
    {
      title: 'Quantum Computing Frontiers',
      content: 'Quantum superpositions enable processors to evaluate multi-dimensional algorithms exponentially faster than traditional classical architectures.',
      language: 'EN',
      difficulty: 'ADVANCED',
      wordCount: 16,
      category: 'TECH',
    },
    {
      title: 'বাঙলার নদী ও প্রকৃতি',
      content: 'পদ্মা মেঘনা যমুনা সুরমা শত শত নদীর কলতানে মুখরিত আমাদের এই রূপসী বাংলা। সবুজ শ্যামল প্রান্তর আর সোনালী ধানের শীষে দোলা দেয় দখিনা বাতাস।',
      language: 'BN',
      difficulty: 'MEDIUM',
      wordCount: 23,
      category: 'LITERATURE',
    },
    {
      title: 'প্রযুক্তি ও তরুণ প্রজন্ম',
      content: 'ডিজিটাল বিপ্লবের এই নতুন যুগে তরুণ প্রজন্মের মেধা ও উদ্ভাবনী শক্তি গোটা বিশ্বের প্রযুক্তি মানচিত্রে বাংলাদেশকে এক অনন্য উচ্চতায় নিয়ে যাচ্ছে।',
      language: 'BN',
      difficulty: 'ADVANCED',
      wordCount: 20,
      category: 'TECH',
    },
  ];

  constructor(
    @InjectModel(TypingPassage.name) private passageModel: Model<TypingPassageDocument>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.passageModel.countDocuments();
      if (count === 0) {
        await this.passageModel.insertMany(this.fallbackPassages);
      }
    } catch (e) {
      // In-memory or initial startup note
    }
  }

  // Authoritative WPM & Accuracy Calculation
  calculateMetrics(
    totalTypedChars: number,
    correctChars: number,
    elapsedSeconds: number,
  ): ScoreCalculationResult {
    const elapsedMinutes = Math.max(elapsedSeconds / 60, 0.05); // prevent divide by zero
    const rawWpm = Number(((totalTypedChars / 5) / elapsedMinutes).toFixed(1));
    const netWpm = Math.max(0, Number(((correctChars / 5) / elapsedMinutes).toFixed(1)));
    const accuracy = totalTypedChars > 0
      ? Number(((correctChars / totalTypedChars) * 100).toFixed(1))
      : 100;
    const incorrectChars = Math.max(0, totalTypedChars - correctChars);

    return {
      rawWpm,
      netWpm,
      accuracy,
      correctCharacters: correctChars,
      incorrectCharacters: incorrectChars,
      totalCharacters: totalTypedChars,
      elapsedSeconds,
    };
  }

  async getRandomPassage(language: string = 'EN', difficulty?: string): Promise<TypingPassage> {
    try {
      const query: any = { language };
      if (difficulty) query.difficulty = difficulty;
      const count = await this.passageModel.countDocuments(query);
      if (count > 0) {
        const random = Math.floor(Math.random() * count);
        return await this.passageModel.findOne(query).skip(random);
      }
    } catch (e) {
      // fallback
    }

    const filtered = this.fallbackPassages.filter(p => p.language === language);
    const chosen = filtered.length > 0 ? filtered[Math.floor(Math.random() * filtered.length)] : this.fallbackPassages[0];
    return chosen as TypingPassage;
  }

  async getPassageById(id: string): Promise<TypingPassage> {
    try {
      const passage = await this.passageModel.findById(id);
      if (passage) return passage;
    } catch (e) {
      // fallback
    }
    return this.fallbackPassages[0] as TypingPassage;
  }
}
