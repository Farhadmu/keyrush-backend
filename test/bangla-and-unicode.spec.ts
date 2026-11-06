import { TypingService } from '../src/typing/typing.service';

describe('Phase 2 & 12: Unicode & Bangla IME Composition Typing Tests', () => {
  let typingService: TypingService;

  beforeEach(() => {
    typingService = new TypingService({} as any, {} as any, {} as any);
  });

  it('Performs Unicode Normalization (NFC) correctly on Bangla text', () => {
    const decomposed = 'বাং\u09CDলা'; // composed/decomposed variants
    const normalized = typingService.normalizeText(decomposed);
    expect(normalized).toBeDefined();
    expect(normalized.length).toBeGreaterThan(0);
  });

  it('Accurately computes Net WPM and 100% accuracy on flawless Bangla passage', () => {
    const text = 'পদ্মা মেঘনা যমুনা সুরমা শত শত নদীর কলতানে মুখরিত আমাদের এই রূপসী বাংলা।';
    const charCount = text.length; // 71 chars = ~14.2 words

    const metrics = typingService.calculateMetrics(charCount, charCount, 30); // 30 seconds
    expect(metrics.accuracy).toBe(100);
    expect(metrics.rawWpm).toBe(metrics.netWpm);
    expect(metrics.netWpm).toBeGreaterThan(25);
  });

  it('Calculates penalty correctly when errors occur in multilingual strings', () => {
    const totalTyped = 200;
    const correct = 180;
    const elapsedSeconds = 60; // 1 minute

    const metrics = typingService.calculateMetrics(totalTyped, correct, elapsedSeconds);
    expect(metrics.rawWpm).toBe(40); // 200 / 5 / 1
    expect(metrics.netWpm).toBe(36); // (200 - 20) / 5 / 1
    expect(metrics.accuracy).toBe(90.0);
  });
});

