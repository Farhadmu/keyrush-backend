import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiAnalysis, AiAnalysisDocument, AiAnalysisType } from './schemas/ai-analysis.schema';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    @InjectModel(AiAnalysis.name) private readonly aiAnalysisModel: Model<AiAnalysisDocument>,
  ) {}

  // -------------------------------------------------------------
  // 7.1 & 7.6 AI Typing Coach & Analytics
  // -------------------------------------------------------------
  async generateCoachingReport(userId: string, history: Array<{ netWpm: number; accuracy: number; language: string; date?: Date }>) {
    if (!history || history.length === 0) {
      return {
        summary: 'Not enough typing session data to formulate custom coaching.',
        speedTier: 'Beginner',
        readinessScore: 50,
        tips: ['Complete 5 practice sessions to unlock personalized AI telemetry insights.'],
      };
    }

    const recentSessions = history.slice(-10);
    const avgWpm = Math.round(recentSessions.reduce((acc, s) => acc + s.netWpm, 0) / recentSessions.length);
    const avgAcc = Number((recentSessions.reduce((acc, s) => acc + s.accuracy, 0) / recentSessions.length).toFixed(1));

    // Consistency analysis
    const wpmValues = recentSessions.map(s => s.netWpm);
    const variance = wpmValues.reduce((acc, v) => acc + Math.pow(v - avgWpm, 2), 0) / wpmValues.length;
    const stdDev = Math.round(Math.sqrt(variance));

    const tips: string[] = [];
    if (avgAcc < 93) {
      tips.push('Prioritize typing rhythm over raw burst speed. Aim for 96%+ accuracy to reduce backspace penalty.');
    } else if (avgAcc >= 98 && avgWpm < 80) {
      tips.push('Your accuracy is exceptional! Push your finger dexterity into higher burst speed without fearing minor mistakes.');
    }

    if (stdDev > 15) {
      tips.push('Your pace fluctuates significantly between words. Focus on looking 2-3 words ahead to maintain a steady rolling rhythm.');
    } else {
      tips.push('Solid cadence stability detected. Maintain your focus on complex punctuation transitions.');
    }

    let speedTier = 'Beginner';
    if (avgWpm >= 110) speedTier = 'Grandmaster';
    else if (avgWpm >= 85) speedTier = 'Elite';
    else if (avgWpm >= 65) speedTier = 'Pro';
    else if (avgWpm >= 45) speedTier = 'Racer';

    const readinessScore = Math.min(Math.round((avgWpm / 100) * 50 + (avgAcc / 100) * 50), 99);

    const result = {
      avgWpm,
      avgAcc,
      consistencyStdDev: stdDev,
      speedTier,
      readinessScore,
      tips,
      historicalTrend: wpmValues,
    };

    const record = new this.aiAnalysisModel({
      userId,
      type: AiAnalysisType.COACHING,
      inputMetrics: { sessionsAnalyzed: recentSessions.length, avgWpm, avgAcc },
      result,
      provider: 'HEURISTIC_ENGINE',
    });
    await record.save();

    return result;
  }

  // -------------------------------------------------------------
  // 7.2 Weakness Detection
  // -------------------------------------------------------------
  async analyzeWeaknesses(userId: string, keyMissMap: Record<string, number>) {
    const misses = Object.entries(keyMissMap || {}).sort((a, b) => b[1] - a[1]);
    const topWeakKeys = misses.slice(0, 5).map(([key, count]) => ({ key, missCount: count }));

    // Formulate targeted drill words based on weak characters
    const targetedDrills: string[] = [];
    topWeakKeys.forEach(({ key }) => {
      const char = key.toLowerCase();
      if (char === 'p' || char === 'q') targetedDrills.push('quip pique prep pump plaque equip popup');
      else if (char === 'z' || char === 'x') targetedDrills.push('pixel azure zenith toxin exact freeze complex');
      else if (char === 'b' || char === 'v') targetedDrills.push('vivid brave verbal vibe velvet absorb cavern');
      else targetedDrills.push(`repeat dynamic ${char} focus drill with rhythm`);
    });

    if (targetedDrills.length === 0) {
      targetedDrills.push('the quick brown fox jumps over the lazy dog repeatedly');
    }

    const result = {
      topWeakKeys,
      totalMissesTracked: misses.reduce((acc, [, c]) => acc + c, 0),
      targetedDrills,
    };

    const record = new this.aiAnalysisModel({
      userId,
      type: AiAnalysisType.WEAKNESS_DETECTION,
      inputMetrics: keyMissMap,
      result,
      provider: 'HEURISTIC_ENGINE',
    });
    await record.save();

    return result;
  }

  // -------------------------------------------------------------
  // 7.3 Personalized Practice Plan
  // -------------------------------------------------------------
  async generatePracticePlan(userId: string, currentLevel: number, avgWpm: number) {
    const dailyGoalMinutes = avgWpm > 70 ? 25 : 15;
    const targetWpm = Math.round(avgWpm * 1.1) + 5;

    const plan = {
      level: currentLevel,
      currentWpm: avgWpm,
      targetWpm,
      dailyGoalMinutes,
      schedule: [
        { day: 'Day 1', focus: 'Warmup & High-Frequency Words', durationMinutes: 10, mode: '60s' },
        { day: 'Day 2', focus: 'Accuracy Conditioning (Zero-Error Sprint)', durationMinutes: 15, mode: 'word_sprint' },
        { day: 'Day 3', focus: 'Punctuation, Numbers & Complex Syntax', durationMinutes: 15, mode: 'code' },
        { day: 'Day 4', focus: 'Bangla Unicode IME Dexterity', durationMinutes: 15, mode: 'paragraph' },
        { day: 'Day 5', focus: 'Endurance & High-Pressure Simulation', durationMinutes: 20, mode: '120s' },
        { day: 'Day 6', focus: 'Multiplayer Competitive Heat Warmup', durationMinutes: 20, mode: 'multiplayer' },
        { day: 'Day 7', focus: 'Milestone Assessment & Personal Best Trial', durationMinutes: 15, mode: '60s' },
      ],
    };

    const record = new this.aiAnalysisModel({
      userId,
      type: AiAnalysisType.PRACTICE_PLAN,
      inputMetrics: { currentLevel, avgWpm },
      result: plan,
      provider: 'HEURISTIC_ENGINE',
    });
    await record.save();

    return plan;
  }

  // -------------------------------------------------------------
  // 7.4 AI Passage Generator (Sanitized & Validated)
  // -------------------------------------------------------------
  async generatePassage(params: { language: string; difficulty: string; topic: string }) {
    const lang = (params.language || 'EN').toUpperCase();
    const diff = (params.difficulty || 'MEDIUM').toUpperCase();
    const topic = (params.topic || 'TECH').toUpperCase();

    // Sanitized high-quality passage library
    const enPassages: Record<string, string[]> = {
      TECH: [
        'Modern distributed systems require rigorous consensus algorithms like Raft and Paxos to synchronize state across asynchronous networks while maintaining deterministic linearizability and fault tolerance.',
        'High-frequency WebSocket channels enable responsive real-time multiplayer telemetry by leveraging lightweight binary framing and persistent TCP sockets with minimal serialization overhead.',
      ],
      RACING: [
        'The turbocharged engine roared as the tires found grip on the apex of the neon-lit asphalt corner. Precision keystrokes unleashed bursts of nitro, propelling the racer ahead of the chasing pack.',
        'Down the final straightaway, milliseconds separated victory from second place. Every keystroke was calibrated with absolute cadence to avoid costly backspaces at terminal velocity.',
      ],
      CYBERPUNK: [
        'Neon reflections danced across wet pavement in the sprawling metropolis. Cybernetic runners competed in underground circuits where terminal speed and cryptographic reflex determined survival.',
      ],
    };

    const bnPassages: Record<string, string[]> = {
      TECH: [
        'আধুনিক কম্পিউটার বিজ্ঞানে অ্যালগরিদম এবং ডেটা স্ট্রাকচার অত্যন্ত গুরুত্বপূর্ণ ভূমিকা পালন করে। সঠিক অনুশীলনের মাধ্যমে আমরা দ্রুত টাইপিং দক্ষতা অর্জন করতে পারি।',
        'ক্লাউড কম্পিউটিং এবং কৃত্রিম বুদ্ধিমত্তা বর্তমান প্রযুক্তি বিপ্লবের অন্যতম চালিকাশক্তি। প্রোগ্রামিং ও টাইপিংয়ের গতি সমস্যা সমাধানের ক্ষমতাকে বহুগুণ বৃদ্ধি করে।',
      ],
      RACING: [
        'প্রতিযোগিতার গতিপথে প্রতিটি সেকেন্ড অত্যন্ত মূল্যবান। নির্ভুলভাবে কিবোর্ডের বোতাম চেপে এগিয়ে যাওয়ার নামই হলো আসল গতি।',
      ],
    };

    const pool = lang === 'BN' ? (bnPassages[topic] || bnPassages.TECH) : (enPassages[topic] || enPassages.TECH);
    const content = pool[Math.floor(Math.random() * pool.length)];

    return {
      title: `${topic} ${diff} Challenge`,
      content,
      language: lang,
      difficulty: diff,
      category: topic,
      wordCount: content.trim().split(/\s+/).length,
      charCount: content.length,
    };
  }

  // -------------------------------------------------------------
  // 7.5 AI Fair-Play Telemetry Assistant
  // -------------------------------------------------------------
  analyzeTelemetryAnomaly(metrics: {
    rawWpm: number;
    netWpm: number;
    accuracy: number;
    wpmDelta: number;
    keystrokeIntervalsMs?: number[];
  }): { isSuspicious: boolean; reason: string; confidence: number } {
    // 1. Physically impossible human sustained speed
    if (metrics.netWpm > 240) {
      return {
        isSuspicious: true,
        reason: `Net WPM of ${metrics.netWpm} exceeds physical human typing threshold (240 WPM limit).`,
        confidence: 0.98,
      };
    }

    // 2. Impossible instantaneous acceleration
    if (metrics.wpmDelta > 45) {
      return {
        isSuspicious: true,
        reason: `Impossible acceleration: +${metrics.wpmDelta} WPM jump in 1 second.`,
        confidence: 0.92,
      };
    }

    // 3. Mechanical input uniformity (zero variance bot macro)
    if (metrics.keystrokeIntervalsMs && metrics.keystrokeIntervalsMs.length >= 10) {
      const avg = metrics.keystrokeIntervalsMs.reduce((a, b) => a + b, 0) / metrics.keystrokeIntervalsMs.length;
      const variance = metrics.keystrokeIntervalsMs.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / metrics.keystrokeIntervalsMs.length;
      if (variance < 1.0 && avg < 60) {
        return {
          isSuspicious: true,
          reason: 'Mechanical macro uniformity: keystroke timing variance near 0ms.',
          confidence: 0.95,
        };
      }
    }

    return { isSuspicious: false, reason: 'Clean telemetry', confidence: 0.1 };
  }
}
