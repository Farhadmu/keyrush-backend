import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as crypto from 'crypto';
import { Competition, CompetitionDocument, CompetitionStatus } from './schemas/competition.schema';
import { CompetitionRegistration, CompetitionRegistrationDocument } from './schemas/registration.schema';
import { TournamentMatch, TournamentMatchDocument, MatchStatus } from './schemas/tournament-match.schema';
import { Certificate, CertificateDocument } from './schemas/certificate.schema';
import { normalizeRole } from '../auth/roles.enum';

@Injectable()
export class CompetitionsService {
  private readonly logger = new Logger(CompetitionsService.name);

  constructor(
    @InjectModel(Competition.name) private compModel: Model<CompetitionDocument>,
    @InjectModel(CompetitionRegistration.name) private regModel: Model<CompetitionRegistrationDocument>,
    @InjectModel(TournamentMatch.name) private matchModel: Model<TournamentMatchDocument>,
    @InjectModel(Certificate.name) private certModel: Model<CertificateDocument>,
  ) {
    this.seedInitialCompetitions();
  }

  private async seedInitialCompetitions() {
    if (process.env.NODE_ENV === 'production') return;
    try {
      const count = await this.compModel.countDocuments();
      if (count === 0) {
        await this.compModel.create({
          title: 'Global Cyber Grand Prix 2026',
          slug: 'global-cyber-grand-prix-2026',
          description: 'Official world championship qualifying tournament for registered esports racers.',
          organizerId: new Types.ObjectId('672439a90b00000000000001'),
          visibility: 'PUBLIC',
          status: CompetitionStatus.REGISTRATION_OPEN,
          currentParticipantCount: 24,
          settings: {
            language: 'EN',
            difficulty: 'ADVANCED',
            raceDurationSeconds: 60,
            minParticipants: 20,
            maxParticipants: 300,
            roomMinPlayers: 2,
            roomMaxPlayers: 7,
            tournamentFormat: 'SINGLE_ELIMINATION',
          },
          registrationStart: new Date(),
          registrationEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          eventStart: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        });
      }
    } catch (e) {}
  }

  async createCompetition(
    organizerId: string,
    data: {
      title: string;
      description?: string;
      category?: string;
      banner?: string;
      logo?: string;
      visibility?: string;
      organizationId?: string;
      contactPerson?: string;
      contactEmail?: string;
      contactPhone?: string;
      country?: string;
      city?: string;
      institution?: string;
      rules?: string;
      termsAndConditions?: string;
      minParticipants?: number;
      maxParticipants?: number;
      language?: string;
      difficulty?: string;
      tournamentFormat?: string;
      qualifyingCount?: number;
      seedingRule?: string;
      tieBreakRule?: string;
      noShowPolicy?: string;
      disconnectionGraceSeconds?: number;
      registrationStart?: Date | string;
      registrationEnd?: Date | string;
      checkInStart?: Date | string;
      checkInEnd?: Date | string;
      eventStart?: Date | string;
      startTime?: Date | string; // alias support
      eventEnd?: Date | string;
      timezone?: string;
      breakIntervalSeconds?: number;
    },
  ) {
    const minP = data.minParticipants ?? 20;
    const maxP = data.maxParticipants ?? 300;

    if (minP < 20) {
      throw new BadRequestException('Minimum event participants cannot be lower than 20.');
    }
    if (maxP > 300) {
      throw new BadRequestException('Maximum event participants cannot exceed 300.');
    }
    if (minP > maxP) {
      throw new BadRequestException('Minimum participants cannot exceed maximum participants.');
    }

    // Schedule and Timezone Parsing & Validation
    const tz = data.timezone || 'Asia/Dhaka';
    try {
      Intl.DateTimeFormat(undefined, { timeZone: tz });
    } catch {
      throw new BadRequestException(`Invalid timezone value: ${tz}`);
    }

    const regStart = data.registrationStart ? new Date(data.registrationStart) : new Date();
    const regEnd = data.registrationEnd
      ? new Date(data.registrationEnd)
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const evStart = data.eventStart
      ? new Date(data.eventStart)
      : data.startTime
      ? new Date(data.startTime)
      : new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);
    const evEnd = data.eventEnd ? new Date(data.eventEnd) : new Date(evStart.getTime() + 4 * 60 * 60 * 1000);

    const chkStart = data.checkInStart
      ? new Date(data.checkInStart)
      : new Date(evStart.getTime() - 60 * 60 * 1000);
    const chkEnd = data.checkInEnd
      ? new Date(data.checkInEnd)
      : new Date(evStart.getTime() - 10 * 60 * 1000);

    if (isNaN(regStart.getTime()) || isNaN(regEnd.getTime()) || isNaN(evStart.getTime())) {
      throw new BadRequestException('Invalid date provided for event schedule.');
    }
    if (regEnd <= regStart) {
      throw new BadRequestException('Registration closing date must be after registration opening date.');
    }
    if (evStart < regEnd) {
      throw new BadRequestException('Event start time must be on or after registration closing time.');
    }
    if (chkEnd <= chkStart) {
      throw new BadRequestException('Check-in closing time must be after check-in opening time.');
    }

    const slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(1000 + Math.random() * 9000);

    // Initial status determined by schedule
    const now = new Date();
    let initialStatus = CompetitionStatus.DRAFT;
    if (now >= regStart && now < regEnd) {
      initialStatus = CompetitionStatus.REGISTRATION_OPEN;
    } else if (now < regStart) {
      initialStatus = CompetitionStatus.PUBLISHED;
    }

    const comp = new this.compModel({
      title: data.title,
      slug,
      description: data.description || '',
      category: data.category || 'UNIVERSITY_ESPORTS',
      banner: data.banner || '',
      logo: data.logo || '',
      organizerId: new Types.ObjectId(organizerId),
      organizationId: data.organizationId && Types.ObjectId.isValid(data.organizationId) ? new Types.ObjectId(data.organizationId) : null,
      contactPerson: data.contactPerson || '',
      contactEmail: data.contactEmail || '',
      contactPhone: data.contactPhone || '',
      country: data.country || 'BD',
      city: data.city || 'Dhaka',
      institution: data.institution || '',
      rules: data.rules || '',
      termsAndConditions: data.termsAndConditions || '',
      visibility: data.visibility || 'PUBLIC',
      status: initialStatus,
      currentParticipantCount: 0,
      registrationStart: regStart,
      registrationEnd: regEnd,
      checkInStart: chkStart,
      checkInEnd: chkEnd,
      eventStart: evStart,
      eventEnd: evEnd,
      timezone: tz,
      breakIntervalSeconds: data.breakIntervalSeconds || 120,
      settings: {
        language: data.language || 'EN',
        difficulty: data.difficulty || 'MEDIUM',
        raceDurationSeconds: 60,
        minParticipants: minP,
        maxParticipants: maxP,
        roomMinPlayers: 2,
        roomMaxPlayers: 7,
        tournamentFormat: data.tournamentFormat || 'SINGLE_ELIMINATION',
        qualifyingCount: data.qualifyingCount || 16,
        seedingRule: data.seedingRule || 'RANDOM',
        tieBreakRule: data.tieBreakRule || 'NET_WPM',
        noShowPolicy: data.noShowPolicy || 'AUTO_LOSS',
        disconnectionGraceSeconds: data.disconnectionGraceSeconds || 15,
      },
    });

    return comp.save();
  }

  async updateCompetitionSchedule(
    competitionId: string,
    scheduleData: {
      registrationStart?: Date | string;
      registrationEnd?: Date | string;
      checkInStart?: Date | string;
      checkInEnd?: Date | string;
      eventStart?: Date | string;
      startTime?: Date | string;
      eventEnd?: Date | string;
      timezone?: string;
    },
    caller?: { userId: string; roles: string[] },
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    const regStart = scheduleData.registrationStart ? new Date(scheduleData.registrationStart) : comp.registrationStart;
    const regEnd = scheduleData.registrationEnd ? new Date(scheduleData.registrationEnd) : comp.registrationEnd;
    const evStart = scheduleData.eventStart
      ? new Date(scheduleData.eventStart)
      : scheduleData.startTime
      ? new Date(scheduleData.startTime)
      : comp.eventStart;
    const evEnd = scheduleData.eventEnd ? new Date(scheduleData.eventEnd) : comp.eventEnd;
    const chkStart = scheduleData.checkInStart ? new Date(scheduleData.checkInStart) : comp.checkInStart;
    const chkEnd = scheduleData.checkInEnd ? new Date(scheduleData.checkInEnd) : comp.checkInEnd;

    if (regEnd <= regStart) {
      throw new BadRequestException('Registration closing date must be after opening date.');
    }
    if (evStart < regEnd) {
      throw new BadRequestException('Event start time must be on or after registration closing time.');
    }

    if (scheduleData.timezone) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: scheduleData.timezone });
        comp.timezone = scheduleData.timezone;
      } catch {
        throw new BadRequestException(`Invalid timezone: ${scheduleData.timezone}`);
      }
    }

    comp.registrationStart = regStart;
    comp.registrationEnd = regEnd;
    comp.checkInStart = chkStart;
    comp.checkInEnd = chkEnd;
    comp.eventStart = evStart;
    comp.eventEnd = evEnd;

    return comp.save();
  }

  async updateCompetitionStatus(
    competitionId: string,
    status: CompetitionStatus,
    caller?: { userId: string; roles: string[] },
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    comp.status = status;
    return comp.save();
  }


  async getAllCompetitions(query?: { organizationId?: string }) {
    const filter: any = {};
    if (query?.organizationId && Types.ObjectId.isValid(query.organizationId)) {
      filter.organizationId = new Types.ObjectId(query.organizationId);
    }
    return this.compModel.find(filter).sort({ createdAt: -1 });
  }

  async getCompetitionByIdOrSlug(identifier: string) {
    const isId = Types.ObjectId.isValid(identifier);
    let comp = await this.compModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(identifier) : null }, { slug: identifier }],
    });
    if (!comp) throw new NotFoundException('Competition not found');
    return comp;
  }

  async registerParticipant(
    competitionId: string,
    user: { userId: string; username: string; roles: string[] },
    studentData?: {
      fullName?: string;
      email?: string;
      phone?: string;
      country?: string;
      city?: string;
      profilePhotoUrl?: string;
      institutionName?: string;
      department?: string;
      studentId?: string;
      registrationNumber?: string;
      academicBatch?: string;
      currentSemester?: string;
      graduationYear?: number;
      preferredLanguage?: string;
      teamName?: string;
      competitionExperience?: string;
      emergencyContact?: string;
      fairPlayConsent?: boolean;
      agreeRules?: boolean;
    },
  ) {
    if (!user || user.roles.includes('GUEST')) {
      throw new BadRequestException('Guest users cannot register for official events. Please create an account.');
    }

    // Role Restriction: ORGANIZER and SUPER_ADMIN cannot compete in tournaments
    const userCanonicalRoles = (user.roles || []).map((r: string) => normalizeRole(r));
    if (userCanonicalRoles.includes('ORGANIZER') || userCanonicalRoles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException(
        'Organizers and Administrators cannot register as competitors in tournaments. Please use an authorized USER account to race.',
      );
    }

    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException(`Registration is closed for this event. Current status: ${comp.status}`);
    }

    const existing = await this.regModel.findOne({
      competitionId: comp._id,
      userId: new Types.ObjectId(user.userId),
    });
    if (existing) {
      throw new ConflictException('You are already registered for this competition.');
    }

    // Atomic capacity reservation preventing high-concurrency overbooking
    const updatedComp = await this.compModel.findOneAndUpdate(
      {
        _id: comp._id,
        status: CompetitionStatus.REGISTRATION_OPEN,
        currentParticipantCount: { $lt: comp.settings.maxParticipants },
      },
      {
        $inc: { currentParticipantCount: 1 },
      },
      { new: true },
    );

    if (!updatedComp) {
      throw new BadRequestException(
        `Event registration is full. Capacity reached: ${comp.settings.maxParticipants} / 300.`,
      );
    }

    const nextSeed = updatedComp.currentParticipantCount;
    const uniqueRegId =
      'REG-' + new Date().getFullYear() + '-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    const registration = new this.regModel({
      registrationId: uniqueRegId,
      competitionId: comp._id,
      userId: new Types.ObjectId(user.userId),
      username: user.username,
      seedNumber: nextSeed,
      status: 'CONFIRMED',
      fullName: studentData?.fullName || user.username,
      email: studentData?.email || '',
      phone: studentData?.phone || '',
      country: studentData?.country || 'BD',
      city: studentData?.city || 'Dhaka',
      profilePhotoUrl: studentData?.profilePhotoUrl || '',
      institutionName: studentData?.institutionName || '',
      department: studentData?.department || '',
      studentId: studentData?.studentId || '',
      registrationNumber: studentData?.registrationNumber || '',
      academicBatch: studentData?.academicBatch || '',
      currentSemester: studentData?.currentSemester || '',
      graduationYear: studentData?.graduationYear || 0,
      preferredLanguage: studentData?.preferredLanguage || comp.settings.language || 'EN',
      teamName: studentData?.teamName || '',
      competitionExperience: studentData?.competitionExperience || '',
      emergencyContact: studentData?.emergencyContact || '',
      verificationStatus: 'PENDING',
      checkInStatus: 'NOT_CHECKED_IN',
      attendanceStatus: 'UNKNOWN',
      fairPlayConsent: studentData?.fairPlayConsent ?? studentData?.agreeRules ?? true,
    });

    try {
      await registration.save();
    } catch (err: any) {
      // Rollback atomic counter on unique index violation
      await this.compModel.findByIdAndUpdate(comp._id, { $inc: { currentParticipantCount: -1 } });
      throw new ConflictException('You are already registered for this competition.');
    }

    if (updatedComp.currentParticipantCount >= updatedComp.settings.maxParticipants) {
      updatedComp.status = CompetitionStatus.REGISTRATION_CLOSED;
      await updatedComp.save();
    }

    return {
      success: true,
      message: 'Successfully registered for competition.',
      registration,
      registrationId: uniqueRegId,
      currentParticipantCount: updatedComp.currentParticipantCount,
      minRequired: updatedComp.settings.minParticipants,
      maxAllowed: updatedComp.settings.maxParticipants,
    };
  }

  async getMyRegistration(competitionId: string, userId: string) {
    if (!Types.ObjectId.isValid(competitionId) || !Types.ObjectId.isValid(userId)) {
      return null;
    }
    return this.regModel.findOne({
      competitionId: new Types.ObjectId(competitionId),
      userId: new Types.ObjectId(userId),
    });
  }

  async checkInParticipant(competitionId: string, user: { userId: string; username: string }) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const now = new Date();
    // Check-in allowed if status is CHECK_IN_OPEN or within checkInStart & checkInEnd
    const isWithinWindow =
      comp.status === CompetitionStatus.CHECK_IN_OPEN ||
      (comp.checkInStart && comp.checkInEnd && now >= comp.checkInStart && now <= comp.checkInEnd);

    if (!isWithinWindow && comp.status !== CompetitionStatus.REGISTRATION_OPEN) {
      throw new BadRequestException('Check-in window is currently closed for this event.');
    }

    const reg = await this.regModel.findOne({
      competitionId: comp._id,
      userId: new Types.ObjectId(user.userId),
      status: 'CONFIRMED',
    });

    if (!reg) {
      throw new NotFoundException('No confirmed registration found for this event.');
    }

    reg.checkInStatus = 'CHECKED_IN';
    reg.checkedInAt = new Date();
    reg.attendanceStatus = 'PRESENT';
    await reg.save();

    return {
      success: true,
      message: 'Check-in verified successfully. You are marked PRESENT for heats.',
      registration: reg,
    };
  }

  async getRegistrations(
    competitionId: string,
    filters?: {
      status?: string;
      verificationStatus?: string;
      checkInStatus?: string;
      search?: string;
    },
    caller?: { userId: string; roles: string[] },
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    const isOrganizerOrAdmin = caller ? (
      (caller.roles && caller.roles.map(r => normalizeRole(r)).includes('SUPER_ADMIN')) ||
      (comp.organizerId && caller.userId && comp.organizerId.toString() === caller.userId.toString())
    ) : false;

    const query: any = { competitionId: comp._id };

    if (filters?.status) {
      query.status = filters.status;
    }
    if (filters?.verificationStatus) {
      query.verificationStatus = filters.verificationStatus;
    }
    if (filters?.checkInStatus) {
      query.checkInStatus = filters.checkInStatus;
    }
    if (filters?.search) {
      const re = new RegExp(filters.search, 'i');
      query.$or = [{ username: re }, { fullName: re }, { studentId: re }, { institutionName: re }, { registrationId: re }];
    }

    const regs = await this.regModel.find(query).sort({ seedNumber: 1 });

    if (isOrganizerOrAdmin) {
      return regs;
    }

    // Public / Non-Organizer view: Redact sensitive PII fields (email, phone, studentId, registrationNumber, emergencyContact)
    // unless the record belongs to the caller themselves
    return regs.map(reg => {
      const isSelf = caller?.userId && reg.userId && reg.userId.toString() === caller.userId.toString();
      if (isSelf) {
        return reg;
      }
      const raw = (reg as any).toObject ? (reg as any).toObject() : { ...(reg as any) };
      return {
        ...raw,
        email: raw.email ? `${raw.email.charAt(0)}***@***` : '',
        phone: raw.phone ? '***-***-****' : '',
        studentId: raw.studentId ? 'REDACTED' : '',
        registrationNumber: raw.registrationNumber ? 'REDACTED' : '',
        emergencyContact: 'REDACTED',
      };
    });
  }

  async verifyStudentRegistration(
    competitionId: string,
    registrationId: string,
    status: 'VERIFIED' | 'REJECTED',
    notes: string = '',
    caller?: { userId: string; roles: string[] },
  ) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    const reg = await this.regModel.findOne({
      competitionId: comp._id,
      $or: [{ _id: Types.ObjectId.isValid(registrationId) ? new Types.ObjectId(registrationId) : null }, { registrationId }],
    });

    if (!reg) throw new NotFoundException('Registration record not found');

    reg.verificationStatus = status;
    reg.verificationNotes = notes;
    reg.verifiedAt = new Date();
    if (caller?.userId && Types.ObjectId.isValid(caller.userId)) {
      reg.verifiedBy = new Types.ObjectId(caller.userId) as any;
    }
    await reg.save();

    return {
      success: true,
      message: `Registration ${reg.registrationId} status updated to ${status}.`,
      registration: reg,
    };
  }

  async exportRegistrationsCsv(competitionId: string, caller?: { userId: string; roles: string[] }): Promise<string> {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    const registrations = await this.regModel.find({ competitionId: comp._id }).sort({ seedNumber: 1 });

    const header = [
      'Registration ID',
      'Seed',
      'Username',
      'Full Name',
      'Email',
      'Phone',
      'Institution',
      'Department',
      'Student ID',
      'Batch',
      'Semester',
      'Status',
      'Verification',
      'Check-In',
      'Language',
    ].join(',');

    const rows = registrations.map((r) => {
      const escape = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
      return [
        escape(r.registrationId),
        r.seedNumber || 0,
        escape(r.username),
        escape(r.fullName),
        escape(r.email),
        escape(r.phone),
        escape(r.institutionName),
        escape(r.department),
        escape(r.studentId),
        escape(r.academicBatch),
        escape(r.currentSemester),
        r.status,
        r.verificationStatus,
        r.checkInStatus,
        r.preferredLanguage,
      ].join(',');
    });

    return [header, ...rows].join('\n');
  }


  async assertCompetitionAdmin(comp: CompetitionDocument, userId?: string, roles: string[] = []): Promise<void> {
    if (!userId) return;
    if (roles.includes('SUPER_ADMIN') || roles.includes('COMPETITION_ADMIN')) return;
    if (comp.organizerId && comp.organizerId.toString() === userId) return;
    throw new ForbiddenException('You do not have permission to manage this competition.');
  }

  // -------------------------------------------------------------
  // Tournament Bracket Engine (Single Elimination / Double / Swiss)
  // -------------------------------------------------------------
  async generateTournamentBracket(competitionId: string, caller?: { userId: string; roles: string[] }) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    const registrations = await this.regModel
      .find({ competitionId: comp._id, status: 'CONFIRMED' })
      .sort({ seedNumber: 1 })
      .exec();

    // Rule 3.2: Minimum 20 confirmed participants
    if (registrations.length < comp.settings.minParticipants) {
      throw new BadRequestException(
        `Cannot generate tournament: Minimum ${comp.settings.minParticipants} confirmed registrations required. Currently have ${registrations.length}.`,
      );
    }

    // Delete any existing matches for this competition
    await this.matchModel.deleteMany({ competitionId: comp._id });

    // Seeding: 1 vs N, 2 vs N-1 across power-of-2 tree up to 300 without 256 truncation
    const count = registrations.length;
    let bracketSize = 32;
    if (count > 32 && count <= 64) bracketSize = 64;
    else if (count > 64 && count <= 128) bracketSize = 128;
    else if (count > 128 && count <= 256) bracketSize = 256;
    else if (count > 256) bracketSize = 512;

    const matches: any[] = [];
    const totalRounds = Math.log2(bracketSize);
    const numFirstRoundMatches = bracketSize / 2;

    // Generate Round 1 matches
    for (let i = 0; i < numFirstRoundMatches; i++) {
      const p1Reg = registrations[i];
      const p2Reg = registrations[bracketSize - 1 - i];

      const player1 = p1Reg
        ? { userId: p1Reg.userId, username: p1Reg.username, seed: p1Reg.seedNumber, score: 0, accuracy: 0, isWinner: false }
        : { userId: null, username: 'BYE', seed: 0, score: 0, accuracy: 0, isWinner: false };

      const player2 = p2Reg
        ? { userId: p2Reg.userId, username: p2Reg.username, seed: p2Reg.seedNumber, score: 0, accuracy: 0, isWinner: false }
        : { userId: null, username: 'BYE', seed: 0, score: 0, accuracy: 0, isWinner: false };

      const isBye = !p1Reg || !p2Reg;
      const winnerId = isBye ? (p1Reg ? p1Reg.userId : (p2Reg ? p2Reg.userId : null)) : null;

      if (isBye) {
        if (p1Reg) player1.isWinner = true;
        if (p2Reg) player2.isWinner = true;
      }

      matches.push({
        competitionId: comp._id,
        roundNumber: 1,
        matchNumber: i + 1,
        roundName: `Round of ${bracketSize}`,
        player1,
        player2,
        winnerId,
        status: isBye ? MatchStatus.BYE : MatchStatus.SCHEDULED,
        scheduledTime: new Date(comp.eventStart || Date.now()),
      });
    }

    // Generate subsequent rounds up to the Grand Final
    for (let round = 2; round <= totalRounds; round++) {
      const matchesInRound = bracketSize / Math.pow(2, round);
      let roundName = `Round of ${bracketSize / Math.pow(2, round - 1)}`;
      if (round === totalRounds) roundName = 'Grand Final';
      else if (round === totalRounds - 1) roundName = 'Semifinals';
      else if (round === totalRounds - 2) roundName = 'Quarterfinals';

      for (let m = 1; m <= matchesInRound; m++) {
        matches.push({
          competitionId: comp._id,
          roundNumber: round,
          matchNumber: m,
          roundName,
          player1: { userId: null, username: 'TBD', seed: 0, score: 0, accuracy: 0, isWinner: false },
          player2: { userId: null, username: 'TBD', seed: 0, score: 0, accuracy: 0, isWinner: false },
          winnerId: null,
          status: MatchStatus.SCHEDULED,
          scheduledTime: new Date(comp.eventStart || Date.now()),
        });
      }
    }

    // Advance Round 1 BYE winners into Round 2 slots
    for (let i = 0; i < numFirstRoundMatches; i++) {
      const m1 = matches[i];
      if (m1.status === MatchStatus.BYE && m1.winnerId) {
        const winner = m1.player1.isWinner ? m1.player1 : m1.player2;
        const r2MatchIndex = numFirstRoundMatches + Math.floor(i / 2);
        const targetMatch = matches[r2MatchIndex];
        if (targetMatch) {
          if (i % 2 === 0) {
            targetMatch.player1 = {
              userId: winner.userId,
              username: winner.username,
              seed: winner.seed,
              score: 0,
              accuracy: 0,
              isWinner: false,
            };
          } else {
            targetMatch.player2 = {
              userId: winner.userId,
              username: winner.username,
              seed: winner.seed,
              score: 0,
              accuracy: 0,
              isWinner: false,
            };
          }
          if (targetMatch.player1?.userId && targetMatch.player2?.userId) {
            targetMatch.status = MatchStatus.READY;
          }
        }
      }
    }

    const createdMatches = await this.matchModel.insertMany(matches);
    comp.status = CompetitionStatus.IN_PROGRESS;
    await comp.save();

    return {
      success: true,
      competitionId: comp._id,
      bracketSize,
      totalMatchesCreated: createdMatches.length,
      matches: createdMatches,
    };
  }

  async getTournamentMatches(competitionId: string) {
    return this.matchModel
      .find({ competitionId: new Types.ObjectId(competitionId) })
      .sort({ roundNumber: 1, matchNumber: 1 })
      .exec();
  }

  async updateMatchResult(
    matchId: string,
    player1Score: number,
    player2Score: number,
    winnerUserId?: string,
    caller?: { userId: string; roles: string[] },
  ) {
    const match = await this.matchModel.findById(matchId);
    if (!match) throw new NotFoundException('Match not found');

    if (match.status === MatchStatus.COMPLETED && (!caller || !caller.roles.includes('SUPER_ADMIN'))) {
      throw new BadRequestException('Match is already completed. Duplicate score recording prevented.');
    }

    if (caller) {
      const comp = await this.compModel.findById(match.competitionId);
      if (comp) {
        await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
      }
    }

    // Tie-break resolution
    let resolvedWinnerId = winnerUserId;
    if (player1Score === player2Score) {
      if (!resolvedWinnerId) {
        if (match.player1.accuracy > match.player2.accuracy) {
          resolvedWinnerId = match.player1.userId?.toString();
        } else if (match.player2.accuracy > match.player1.accuracy) {
          resolvedWinnerId = match.player2.userId?.toString();
        } else {
          throw new BadRequestException('Scores are tied. Please provide an explicit winner or tie-break accuracy.');
        }
      }
    } else {
      resolvedWinnerId = resolvedWinnerId || (player1Score > player2Score ? match.player1.userId?.toString() : match.player2.userId?.toString());
    }

    match.player1.score = player1Score;
    match.player2.score = player2Score;
    match.winnerId = (resolvedWinnerId && Types.ObjectId.isValid(resolvedWinnerId) ? new Types.ObjectId(resolvedWinnerId) : resolvedWinnerId) as any;
    match.player1.isWinner = match.player1.userId?.toString() === resolvedWinnerId;
    match.player2.isWinner = match.player2.userId?.toString() === resolvedWinnerId;
    match.status = MatchStatus.COMPLETED;
    match.completedAt = new Date();
    await match.save();

    // Advance winner to the next round match
    const winningPlayer = match.player1.isWinner ? match.player1 : match.player2;
    const nextRoundNumber = match.roundNumber + 1;
    const nextMatchNumber = Math.ceil(match.matchNumber / 2);
    const isSlot1 = match.matchNumber % 2 !== 0;

    const nextMatch = await this.matchModel.findOne({
      competitionId: match.competitionId,
      roundNumber: nextRoundNumber,
      matchNumber: nextMatchNumber,
    });

    if (nextMatch) {
      if (isSlot1) {
        nextMatch.player1 = {
          userId: winningPlayer.userId,
          username: winningPlayer.username,
          seed: winningPlayer.seed,
          score: 0,
          accuracy: 0,
          isWinner: false,
        };
      } else {
        nextMatch.player2 = {
          userId: winningPlayer.userId,
          username: winningPlayer.username,
          seed: winningPlayer.seed,
          score: 0,
          accuracy: 0,
          isWinner: false,
        };
      }
      if (nextMatch.player1?.userId && nextMatch.player2?.userId) {
        nextMatch.status = MatchStatus.READY;
      }
      await nextMatch.save();
    } else {
      // Grand Final concluded! Mark competition as completed
      await this.compModel.findByIdAndUpdate(match.competitionId, {
        status: CompetitionStatus.COMPLETED,
      });
    }

    return match;
  }

  // -------------------------------------------------------------
  // Registration Cancellation & Capacity Release
  // -------------------------------------------------------------
  async cancelRegistration(competitionId: string, userId: string) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (comp.status !== CompetitionStatus.REGISTRATION_OPEN && comp.status !== CompetitionStatus.REGISTRATION_CLOSED) {
      throw new BadRequestException('Cannot cancel registration: Tournament is already in progress or completed.');
    }

    const registration = await this.regModel.findOne({
      competitionId: comp._id,
      userId: Types.ObjectId.isValid(userId) ? new Types.ObjectId(userId) : userId,
    });

    if (!registration) {
      throw new NotFoundException('Registration record not found.');
    }

    await this.regModel.deleteOne({ _id: registration._id });

    const updatedComp = await this.compModel.findByIdAndUpdate(
      comp._id,
      {
        $inc: { currentParticipantCount: -1 },
        $set: { status: CompetitionStatus.REGISTRATION_OPEN },
      },
      { new: true },
    );

    return {
      success: true,
      message: 'Registration successfully cancelled and capacity released.',
      currentParticipantCount: updatedComp?.currentParticipantCount || 0,
    };
  }

  // -------------------------------------------------------------
  // Digital Certificate Cryptographic Issuance & Verification
  // -------------------------------------------------------------
  async issueCertificates(competitionId: string, caller?: { userId: string; roles: string[] }) {
    const comp = await this.compModel.findById(competitionId);
    if (!comp) throw new NotFoundException('Competition not found');

    if (caller) {
      await this.assertCompetitionAdmin(comp, caller.userId, caller.roles);
    }

    const signingSecret = process.env.CERTIFICATE_SIGNING_SECRET || process.env.JWT_SECRET || 'keyrush_cert_sign_secret_key_2026!';
    const completedMatches = await this.matchModel
      .find({ competitionId: comp._id, status: MatchStatus.COMPLETED })
      .sort({ roundNumber: -1 })
      .exec();

    const registrations = await this.regModel.find({ competitionId: comp._id, status: 'CONFIRMED' }).limit(3);
    const issuedCerts: CertificateDocument[] = [];

    const ranks = ['CHAMPION (1st Place)', 'RUNNER-UP (2nd Place)', 'THIRD PLACE (3rd Place)'];

    for (let i = 0; i < registrations.length; i++) {
      const reg = registrations[i];
      const certId = `KR-CERT-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
      
      let bestWpm = 85;
      let accuracy = 97.5;
      if (completedMatches.length > 0) {
        const userMatch = completedMatches.find(
          m => m.winnerId?.toString() === reg.userId.toString() ||
               m.player1?.userId?.toString() === reg.userId.toString() ||
               m.player2?.userId?.toString() === reg.userId.toString(),
        );
        if (userMatch) {
          const isP1 = userMatch.player1?.userId?.toString() === reg.userId.toString();
          bestWpm = isP1 ? (userMatch.player1?.score || 85) : (userMatch.player2?.score || 85);
          accuracy = isP1 ? (userMatch.player1?.accuracy || 97.5) : (userMatch.player2?.accuracy || 97.5);
        }
      }

      const achievementRank = ranks[i] || 'HONORABLE FINALIST';
      const verificationPayload = `${certId}|${comp._id}|${reg.userId}|${achievementRank}|${bestWpm}|${accuracy}`;
      const verificationHash = crypto.createHmac('sha256', signingSecret).update(verificationPayload).digest('hex');

      const cert = new this.certModel({
        certificateId: certId,
        competitionId: comp._id,
        competitionTitle: comp.title,
        userId: reg.userId,
        recipientName: reg.username,
        achievementRank,
        bestWpm,
        accuracy,
        issueDate: new Date(),
        verificationHash,
      });

      issuedCerts.push(await cert.save());
    }

    comp.status = CompetitionStatus.COMPLETED;
    await comp.save();

    return issuedCerts;
  }

  async verifyCertificate(certificateId: string) {
    const cert = await this.certModel.findOne({ certificateId }).exec();
    if (!cert) throw new NotFoundException('Certificate not found or invalid ID.');

    if (cert.isRevoked) {
      return {
        isValid: false,
        certificate: cert,
        status: 'REVOKED',
        reason: cert.revocationReason || 'Certificate has been revoked by competition authority.',
      };
    }

    const signingSecret = process.env.CERTIFICATE_SIGNING_SECRET || process.env.JWT_SECRET || 'keyrush_cert_sign_secret_key_2026!';
    const expectedPayload = `${cert.certificateId}|${cert.competitionId}|${cert.userId}|${cert.achievementRank}|${cert.bestWpm}|${cert.accuracy}`;
    const expectedHash = crypto.createHmac('sha256', signingSecret).update(expectedPayload).digest('hex');

    const isValidSignature = cert.verificationHash === expectedHash;
    if (!isValidSignature) {
      return {
        isValid: false,
        certificate: cert,
        status: 'TAMPERED_INVALID_SIGNATURE',
        message: 'Security Alert: Cryptographic signature mismatch. Record has been altered.',
      };
    }

    return {
      isValid: true,
      certificate: cert,
      status: 'VERIFIED_AUTHENTIC',
    };
  }

  async getUserCertificates(userId: string) {
    if (!Types.ObjectId.isValid(userId)) return [];
    return this.certModel.find({ userId: new Types.ObjectId(userId) }).sort({ createdAt: -1 }).exec();
  }
}
