import { CompetitionsService } from '../src/competitions/competitions.service';
import { Types } from 'mongoose';
import * as crypto from 'crypto';

describe('Cryptographic Certificate Integrity & Tamper Detection', () => {
  let service: CompetitionsService;
  let compModelMock: any;
  let regModelMock: any;
  let matchModelMock: any;
  let certModelMock: any;

  const signingSecret = 'test_certificate_signing_secret_32bytes!';
  process.env.CERTIFICATE_SIGNING_SECRET = signingSecret;

  beforeEach(() => {
    compModelMock = {
      findById: jest.fn(),
      countDocuments: jest.fn().mockResolvedValue(1),
    };
    regModelMock = {
      find: jest.fn(),
    };
    matchModelMock = {
      find: jest.fn(),
    };
    certModelMock = function (data: any) {
      return {
        ...data,
        save: jest.fn().mockResolvedValue(data),
      };
    };
    certModelMock.findOne = jest.fn();

    service = new CompetitionsService(
      compModelMock as any,
      regModelMock as any,
      matchModelMock as any,
      certModelMock as any,
    );
  });

  it('VERIFY: Valid cryptographically signed certificate returns VERIFIED_AUTHENTIC', async () => {
    const certId = 'KR-CERT-TEST-001';
    const compId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const rank = 'CHAMPION (1st Place)';
    const bestWpm = 115;
    const accuracy = 99.2;

    const payload = `${certId}|${compId}|${userId}|${rank}|${bestWpm}|${accuracy}`;
    const validSignature = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');

    certModelMock.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        certificateId: certId,
        competitionId: compId,
        userId,
        recipientName: 'ProRacer',
        achievementRank: rank,
        bestWpm,
        accuracy,
        verificationHash: validSignature,
        isRevoked: false,
      }),
    });

    const result = await service.verifyCertificate(certId);

    expect(result.isValid).toBe(true);
    expect(result.status).toBe('VERIFIED_AUTHENTIC');
  });

  it('TAMPER DETECTION: Modified certificate payload fails signature check', async () => {
    const certId = 'KR-CERT-TEST-002';
    const compId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const rank = 'CHAMPION (1st Place)';
    const originalWpm = 100;
    const accuracy = 98.0;

    // Genuine signature generated for 100 WPM
    const originalPayload = `${certId}|${compId}|${userId}|${rank}|${originalWpm}|${accuracy}`;
    const originalSignature = crypto.createHmac('sha256', signingSecret).update(originalPayload).digest('hex');

    // Attacker modifies bestWpm in database to 150 WPM
    certModelMock.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        certificateId: certId,
        competitionId: compId,
        userId,
        recipientName: 'CheatingRacer',
        achievementRank: rank,
        bestWpm: 150, // Tampered!
        accuracy,
        verificationHash: originalSignature, // Old signature
        isRevoked: false,
      }),
    });

    const result = await service.verifyCertificate(certId);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('TAMPERED_INVALID_SIGNATURE');
  });

  it('REVOCATION: Revoked certificate returns status REVOKED even if signature is valid', async () => {
    const certId = 'KR-CERT-REVOKED-003';
    const compId = new Types.ObjectId().toString();
    const userId = new Types.ObjectId().toString();
    const rank = 'RUNNER-UP';
    const bestWpm = 95;
    const accuracy = 97.0;

    const payload = `${certId}|${compId}|${userId}|${rank}|${bestWpm}|${accuracy}`;
    const validSignature = crypto.createHmac('sha256', signingSecret).update(payload).digest('hex');

    certModelMock.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue({
        certificateId: certId,
        competitionId: compId,
        userId,
        achievementRank: rank,
        bestWpm,
        accuracy,
        verificationHash: validSignature,
        isRevoked: true,
        revocationReason: 'Disqualified for fair-play breach',
      }),
    });

    const result = await service.verifyCertificate(certId);

    expect(result.isValid).toBe(false);
    expect(result.status).toBe('REVOKED');
    expect(result.reason).toContain('fair-play breach');
  });
});

