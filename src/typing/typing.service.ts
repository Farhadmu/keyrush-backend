import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { TypingPassage, TypingPassageDocument } from './schemas/passage.schema';
import { TypingResult, TypingResultDocument } from './schemas/typing-result.schema';
import { Profile, ProfileDocument } from '../users/schemas/profile.schema';

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
  private readonly logger = new Logger(TypingService.name);

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
      title: 'TypeScript Clean Architecture',
      content: 'interface VehicleEngine { ignite(): Promise<boolean>; throttle(pressure: number): void; shutdown(): void; }',
      language: 'EN',
      difficulty: 'EXPERT',
      wordCount: 12,
      category: 'CODE',
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
    @InjectModel(TypingResult.name) private typingResultModel: Model<TypingResultDocument>,
    @InjectModel(Profile.name) private profileModel: Model<ProfileDocument>,
  ) {}

  async onModuleInit() {
    try {
      const count = await this.passageModel.countDocuments();
      if (count === 0) {
        await this.passageModel.insertMany(this.fallbackPassages);
        this.logger.log('Seeded default multilingual typing passages');
      }
    } catch (e: any) {
      this.logger.warn(`Could not seed passages: ${e.message}`);
    }
  }

  // Authoritative WPM & Accuracy calculation
  calculateMetrics(
    totalCharactersTyped: number,
    correctCharacters: number,
    elapsedSeconds: number,
  ): ScoreCalculationResult {
    const safeElapsed = Math.max(elapsedSeconds, 0.5);
    const minutes = safeElapsed / 60;
    const incorrectCharacters = Math.max(0, totalCharactersTyped - correctCharacters);

    // Standard formula: 5 characters = 1 word
    const rawWpm = Math.round((totalCharactersTyped / 5) / minutes);
    const netWpm = Math.max(0, Math.round(((totalCharactersTyped / 5) - (incorrectCharacters / 5)) / minutes));

    const accuracy = totalCharactersTyped > 0
      ? Number(((correctCharacters / totalCharactersTyped) * 100).toFixed(1))
      : 100;

    return {
      rawWpm,
      netWpm,
      accuracy: Math.min(accuracy, 100),
      correctCharacters,
      incorrectCharacters,
      totalCharacters: totalCharactersTyped,
      elapsedSeconds: Number(safeElapsed.toFixed(2)),
    };
  }

  // Unicode & IME Normalized matching
  normalizeText(input: string): string {
    return (input || '').normalize('NFC');
  }

  generatePassage(language: string = 'EN', targetWords: number = 50): { title: string; content: string; wordCount: number; language: string; difficulty: string } {
    const isBn = language.toUpperCase() === 'BN';
    const enSentences = [
      'The cybernetic racing machines lined up along the starting grid with engines roaring.',
      'Neon light reflected across the polished carbon fiber chassis of the high-speed vehicles.',
      'Every keystroke transmitted electric impulse signals directly into the hyper-drive transmission.',
      'Mastering keystroke rhythm and timing separates casual drivers from elite esports champions.',
      'The digital track curved sharply through towering skyscrapers glowing under the midnight sky.',
      'Nitro boosters ignited with a blast of plasma, propelling the racer past the competition.',
      'Precision accuracy is the ultimate weapon on this circuit where split seconds dictate victory.',
      'Advanced telemetry showed peak acceleration as the vehicle crossed the hundred mile threshold.',
      'Crowds of spectators cheered from the holographic grandstands overlooking the finish arch.',
      'The checkered flag waved in triumph as the champion racer sealed another legendary lap record.',
      'Strategic typing discipline ensures that speed increases without sacrificing accuracy or control.',
      'Downshifts and throttle control are synchronized flawlessly with rapid mechanical keystrokes.',
      'Aerodynamic spoilers generated downforce to keep the vehicle stabilized through the neon hairpin.',
      'Tactical racers monitor their streak meters closely to unleash continuous nitro propulsion.',
      'The journey from a rookie driver to a grandmaster esports racer demands relentless dedication.'
    ];

    const bnSentences = [
      'পদ্মা মেঘনা যমুনা ও সুরমা নদীর কলতানে মুখরিত আমাদের এই রূপসী সোনার বাংলাদেশ।',
      'সবুজ শ্যামল প্রান্তর আর সোনালী ধানের শীষে দখিনা বাতাসের মিষ্টি পরশ ছড়িয়ে পড়ে।',
      'ডিজিটাল যুগে তরুণ প্রজন্মের মেধা ও উদ্ভাবনী শক্তি দেশকে বিশ্বমঞ্চে অনন্য উচ্চতায় পৌঁছে দিচ্ছে।',
      'দ্রুত ও নির্ভুল টাইপিং দক্ষতা আজকের আধুনিক তথ্যপ্রযুক্তির যুগে এক অপরিহার্য শক্তি।',
      'সাইবার স্পিডওয়েতে প্রতিটি নির্ভুল অক্ষরের ছোঁয়ায় গাড়ির গতি বিদ্যুৎ বেগে বৃদ্ধি পেতে থাকে।',
      'পরিশ্রম, একাগ্রতা এবং নিয়মিত অনুশীলনই একজন সাধারণ প্রতিযোগী থেকে গ্র্যান্ডমাস্টার করে তোলে।',
      'ঐতিহাসিক ভাষা আন্দোলনের রক্তস্নাত চেতনা আমাদের মাতৃভাষাকে বিশ্বদরবারে গৌরবান্বিত করেছে।',
      'প্রযুক্তির নতুন দিগন্তে কৃত্রিম বুদ্ধিমত্তা ও মহাকাশ বিজ্ঞান মানবজাতিকে এগিয়ে নিয়ে চলেছে।',
      'গতির লড়াইয়ে বিজয়ী হতে হলে ক্ষিপ্রতার সাথে সাথে নিখুঁত মনোযোগ বজায় রাখা আবশ্যক।',
      'শেষ দাগ অতিক্রম করার মুহূর্তে বিজয়ীর আনন্দ পুরো রেসিং ট্র্যাকে এক উৎসবের আবহ তৈরি করে।'
    ];

    const pool = isBn ? bnSentences : enSentences;
    let assembled = '';
    let currentWords = 0;
    let index = Math.floor(Math.random() * pool.length);

    while (currentWords < targetWords) {
      const sentence = pool[index % pool.length];
      assembled = assembled ? `${assembled} ${sentence}` : sentence;
      currentWords = assembled.trim().split(/\s+/).length;
      index++;
      if (currentWords >= targetWords) break;
    }

    const words = assembled.trim().split(/\s+/);
    const finalWords = words.slice(0, Math.max(10, targetWords));
    const finalContent = finalWords.join(' ');
    const count = finalWords.length;

    const diff = count <= 35 ? 'EASY' : count <= 75 ? 'MEDIUM' : count <= 150 ? 'ADVANCED' : 'EXPERT';
    const titlesEn = ['Neon Velocity Circuit', 'Cyber Grand Prix', 'Quantum Horizon', 'Apex Hyperdrive', 'Endurance Cup'];
    const titlesBn = ['রূপসী বাঙলা সার্কিট', 'সাইবার স্পিড গ্রাঁ প্রি', 'ডিজিটাল বিপ্লব ট্র‍্যাক', 'মহাকাশ অভিযান কাপ'];

    const title = isBn 
      ? titlesBn[Math.floor(Math.random() * titlesBn.length)] 
      : titlesEn[Math.floor(Math.random() * titlesEn.length)];

    return {
      title: `${title} (${count} Words)`,
      content: finalContent,
      wordCount: count,
      language: language.toUpperCase(),
      difficulty: diff,
    };
  }

  async getRandomPassage(language: string = 'EN', difficulty?: string, targetWords?: number): Promise<TypingPassageDocument | any> {
    const lang = language.toUpperCase();

    if (targetWords && targetWords > 0) {
      try {
        const matched = await this.passageModel.findOne({
          language: lang,
          wordCount: { $gte: targetWords - 10, $lte: targetWords + 10 },
        });
        if (matched) return matched;

        const generated = this.generatePassage(lang, targetWords);
        const saved = await this.passageModel.create({
          title: generated.title,
          content: generated.content,
          language: generated.language,
          difficulty: generated.difficulty,
          wordCount: generated.wordCount,
          category: 'CUSTOM',
          isPublic: true,
        });
        return saved;
      } catch {
        const gen = this.generatePassage(lang, targetWords);
        return {
          _id: 'gen_' + Date.now(),
          ...gen,
        };
      }
    }

    const query: any = { language: lang };
    if (difficulty) query.difficulty = difficulty.toUpperCase();

    try {
      const count = await this.passageModel.countDocuments(query);
      if (!count || count === 0) {
        const defaultDoc = this.passageModel.findOne(query) || this.passageModel.findOne();
        return typeof (defaultDoc as any)?.exec === 'function' ? await (defaultDoc as any).exec() : defaultDoc;
      }
      const random = Math.floor(Math.random() * count);
      const queryBuilder = this.passageModel.findOne(query);
      if (queryBuilder && typeof (queryBuilder as any).skip === 'function') {
        const skipped = (queryBuilder as any).skip(random);
        return typeof skipped?.exec === 'function' ? await skipped.exec() : skipped;
      }
      return typeof (queryBuilder as any)?.exec === 'function' ? await (queryBuilder as any).exec() : queryBuilder;
    } catch {
      return {
        _id: 'default_pass_1',
        title: 'Cyber Velocity',
        content: 'Accelerate through the digital highway of the typing grid at maximum speed.',
        wordCount: 12,
        language: lang,
      } as any;
    }
  }

  async getAllPassages(language?: string): Promise<TypingPassageDocument[]> {
    const query: any = {};
    if (language) query.language = language.toUpperCase();
    return this.passageModel.find(query).exec();
  }

  // -------------------------------------------------------------
  // Practice Session Persistence & Stats
  // -------------------------------------------------------------
  async recordPracticeSession(data: {
    userId: string;
    passageId?: string;
    mode: string;
    language: string;
    rawWpm: number;
    netWpm: number;
    accuracy: number;
    durationSeconds: number;
    correctChars: number;
    incorrectChars: number;
    keyMisses?: Record<string, number>;
  }): Promise<TypingResultDocument> {
    const result = new this.typingResultModel({
      userId: new Types.ObjectId(data.userId),
      passageId: data.passageId && Types.ObjectId.isValid(data.passageId) ? new Types.ObjectId(data.passageId) : null,
      mode: data.mode || '60s',
      language: (data.language || 'EN').toUpperCase(),
      rawWpm: data.rawWpm,
      netWpm: data.netWpm,
      accuracy: data.accuracy,
      durationSeconds: data.durationSeconds,
      correctChars: data.correctChars,
      incorrectChars: data.incorrectChars,
      keyMisses: data.keyMisses || {},
    });

    const saved = await result.save();

    // Update profile practice time and stats
    if (Types.ObjectId.isValid(data.userId)) {
      const profile = await this.profileModel.findOne({ userId: new Types.ObjectId(data.userId) });
      if (profile) {
        profile.stats.totalPracticeTimeMs += (data.durationSeconds * 1000);
        if (data.netWpm > profile.stats.bestWpm) {
          profile.stats.bestWpm = data.netWpm;
        }
        profile.xp += 25; // 25 XP per practice drill
        profile.level = Math.floor(profile.xp / 500) + 1;
        await profile.save();
      }
    }

    return saved;
  }

  async getUserPracticeHistory(userId: string, limit: number = 20) {
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.typingResultModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();
  }

  async getUserWeaknesses(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return {};
    const results = await this.typingResultModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(30)
      .select('keyMisses')
      .exec();

    const aggregateMisses: Record<string, number> = {};
    for (const r of results) {
      if (r.keyMisses) {
        for (const [key, count] of Object.entries(r.keyMisses)) {
          aggregateMisses[key] = (aggregateMisses[key] || 0) + (count as number);
        }
      }
    }
    return aggregateMisses;
  }
}
