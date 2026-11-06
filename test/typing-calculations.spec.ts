import { TypingService } from '../src/typing/typing.service';
import { RacingService } from '../src/racing/racing.service';

describe('Typing & Racing Formula Calculations', () => {
  let typingService: TypingService;
  let racingService: RacingService;

  beforeEach(() => {
    typingService = new TypingService({} as any);
    racingService = new RacingService();
  });

  it('calculates Raw and Net WPM accurately using standard 5-character formula', () => {
    // 300 total chars typed, 280 correct, in 60 seconds (1 minute)
    // Raw WPM = (300 / 5) / 1 = 60
    // Net WPM = (280 / 5) / 1 = 56
    // Accuracy = (280 / 300) * 100 = 93.3%
    const metrics = typingService.calculateMetrics(300, 280, 60);

    expect(metrics.rawWpm).toBe(60);
    expect(metrics.netWpm).toBe(56);
    expect(metrics.accuracy).toBe(93.3);
    expect(metrics.incorrectCharacters).toBe(20);
  });

  it('calculates Vehicle speed dynamically and applies Nitro boost bonus', () => {
    const normalSpeed = racingService.calculateVehicleSpeed(60, 95, false);
    const nitroSpeed = racingService.calculateVehicleSpeed(60, 95, true);

    expect(normalSpeed).toBeGreaterThan(50);
    expect(nitroSpeed).toBeGreaterThan(normalSpeed);
    // Nitro applies ~25% boost
    expect(nitroSpeed).toBeCloseTo(Math.round(normalSpeed * 1.25), -1);
  });
});
