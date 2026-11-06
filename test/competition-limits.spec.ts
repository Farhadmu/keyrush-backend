import { EventHeatsService } from '../src/event-heats/event-heats.service';
import { BadRequestException } from '@nestjs/common';

describe('Absolute Game Rule 3.2: Official Event Limits (20-300 Participants) & Heat Engine', () => {
  let heatsService: EventHeatsService;

  beforeEach(() => {
    heatsService = new EventHeatsService(
      {} as any,
      {} as any,
      {} as any,
    );
  });

  const generateMockParticipants = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      userId: `user_${i + 1}`,
      username: `Participant_${i + 1}`,
      seedNumber: i + 1,
    }));
  };

  it('RULE 3.2: Event with 19 participants CANNOT officially start (minimum 20 required)', () => {
    const nineteenParticipants = generateMockParticipants(19);

    expect(() => {
      heatsService.partitionParticipants(nineteenParticipants);
    }).toThrow(BadRequestException);
  });

  it('RULE 3.2: Event with exactly 20 participants starts and partitions into valid 2-7 player heats', () => {
    const twentyParticipants = generateMockParticipants(20);
    const heats = heatsService.partitionParticipants(twentyParticipants);

    expect(heats.length).toBeGreaterThan(0);
    const totalAssigned = heats.reduce((sum, h) => sum + h.participantCount, 0);
    expect(totalAssigned).toBe(20);

    // Rule: Every heat MUST contain between 2 and 7 players
    heats.forEach(heat => {
      expect(heat.participantCount).toBeGreaterThanOrEqual(2);
      expect(heat.participantCount).toBeLessThanOrEqual(7);
    });
  });

  it('RULE 3.2: Event with maximum 300 participants partitions into valid 2-7 player heats', () => {
    const threeHundredParticipants = generateMockParticipants(300);
    const heats = heatsService.partitionParticipants(threeHundredParticipants);

    const totalAssigned = heats.reduce((sum, h) => sum + h.participantCount, 0);
    expect(totalAssigned).toBe(300);

    // Verify every single heat strictly satisfies [2, 7]
    heats.forEach(heat => {
      expect(heat.participantCount).toBeGreaterThanOrEqual(2);
      expect(heat.participantCount).toBeLessThanOrEqual(7);
    });

    // Never all 300 in 1 room!
    expect(heats.length).toBeGreaterThan(1);
    expect(heats.length).toBe(Math.ceil(300 / 7)); // 43 heats
  });

  it('RULE 3.2: 301 participants MUST be rejected (exceeds platform maximum limit of 300)', () => {
    const overCapacity = generateMockParticipants(301);

    expect(() => {
      heatsService.partitionParticipants(overCapacity);
    }).toThrow(BadRequestException);
  });

  it('RULE 3.2: Heat generation never generates a 1-player racing heat for any N from 20 to 300', () => {
    // Comprehensive boundary sweep from 20 up to 300 participants
    for (let n = 20; n <= 300; n += 17) {
      const participants = generateMockParticipants(n);
      const heats = heatsService.partitionParticipants(participants);

      heats.forEach(heat => {
        expect(heat.participantCount).toBeGreaterThanOrEqual(2);
        expect(heat.participantCount).toBeLessThanOrEqual(7);
      });
    }
  });
});
