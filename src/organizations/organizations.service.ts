import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';
import { Team, TeamDocument } from './schemas/team.schema';
import {
  OrganizationMember,
  OrganizationMemberDocument,
  OrgRole,
  MembershipStatus,
} from './schemas/organization-member.schema';
import { AuditService } from '../common/audit/audit.service';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Team.name) private teamModel: Model<TeamDocument>,
    @InjectModel(OrganizationMember.name) private memberModel: Model<OrganizationMemberDocument>,
    @Optional() private readonly auditService?: AuditService,
  ) {
    this.seedDefaultOrganizations();
  }

  private async seedDefaultOrganizations() {
    try {
      const count = await this.orgModel.countDocuments();
      if (count === 0) {
        await this.orgModel.create([
          {
            name: 'Dhaka University Esports & Coding Club',
            slug: 'du-esports-coding-club',
            type: 'UNIVERSITY',
            country: 'BD',
            website: 'https://du.ac.bd',
            isVerified: true,
            ownerId: new Types.ObjectId('672439a90b00000000000001'),
            memberCount: 48,
          },
          {
            name: 'BUET Computer Science Community',
            slug: 'buet-cse-community',
            type: 'UNIVERSITY',
            country: 'BD',
            website: 'https://cse.buet.ac.bd',
            isVerified: true,
            ownerId: new Types.ObjectId('672439a90b00000000000001'),
            memberCount: 65,
          },
        ]);
      }
    } catch (e) {}
  }

  async getAllOrganizations() {
    return this.orgModel.find().sort({ memberCount: -1 });
  }

  async getOrganizationBySlug(slug: string) {
    const isId = Types.ObjectId.isValid(slug);
    const org = await this.orgModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(slug) : null }, { slug }],
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async createOrganization(
    ownerId: string,
    data: { name: string; type?: string; country?: string; website?: string; logoUrl?: string },
  ) {
    const slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.floor(100 + Math.random() * 900);
    const existing = await this.orgModel.findOne({ slug });
    if (existing) throw new ConflictException('Organization name is already registered');

    const org = new this.orgModel({
      name: data.name,
      slug,
      type: data.type || 'UNIVERSITY',
      country: data.country || 'BD',
      website: data.website || '',
      logoUrl: data.logoUrl || 'https://images.unsplash.com/photo-1541339907198-e08756dedf3f?w=150&auto=format&fit=crop&q=80',
      isVerified: false,
      ownerId: new Types.ObjectId(ownerId),
      memberCount: 1,
    });
    await org.save();

    // Assign owner role in members collection
    const membership = new this.memberModel({
      organizationId: org._id,
      userId: new Types.ObjectId(ownerId),
      role: OrgRole.OWNER,
      status: MembershipStatus.APPROVED,
      title: 'Founder & Admin',
    });
    await membership.save();

    await this.userModel.findByIdAndUpdate(ownerId, {
      $addToSet: { roles: UserRole.ORGANIZATION_ADMIN },
      organizationId: org._id,
    });

    return org;
  }

  // -------------------------------------------------------------
  // Member Management & Join Workflow
  // -------------------------------------------------------------
  async requestJoin(orgId: string, userId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.memberModel.findOne({
      organizationId: org._id,
      userId: new Types.ObjectId(userId),
    });
    if (existing) {
      if (existing.status === MembershipStatus.APPROVED) {
        throw new ConflictException('You are already an approved member of this organization.');
      }
      throw new ConflictException('Your membership request is currently pending approval.');
    }

    const membership = new this.memberModel({
      organizationId: org._id,
      userId: new Types.ObjectId(userId),
      role: OrgRole.MEMBER,
      status: MembershipStatus.PENDING,
    });
    await membership.save();

    return { success: true, message: 'Membership request submitted successfully.' };
  }

  async assertOrgAdmin(org: OrganizationDocument, userId: string): Promise<void> {
    if (org.ownerId.toString() === userId) return;
    const user = await this.userModel.findById(userId);
    if (user?.roles?.includes(UserRole.SUPER_ADMIN)) return;

    const membership = await this.memberModel.findOne({
      organizationId: org._id,
      userId: new Types.ObjectId(userId),
      role: { $in: [OrgRole.OWNER, OrgRole.ADMIN] },
      status: MembershipStatus.APPROVED,
    });
    if (!membership) {
      throw new ForbiddenException('Only organization administrators can perform this action.');
    }
  }

  async approveMember(orgId: string, adminUserId: string, memberId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    await this.assertOrgAdmin(org, adminUserId);

    const member = await this.memberModel.findById(memberId);
    if (!member) throw new NotFoundException('Membership request not found');

    member.status = MembershipStatus.APPROVED;
    await member.save();

    org.memberCount += 1;
    await org.save();

    return { success: true, message: 'Member approved successfully.', member };
  }

  async removeMember(orgId: string, adminUserId: string, memberId: string) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    await this.assertOrgAdmin(org, adminUserId);

    await this.memberModel.findByIdAndDelete(memberId);
    org.memberCount = Math.max(1, org.memberCount - 1);
    await org.save();

    return { success: true, message: 'Member removed from organization.' };
  }

  async getMembers(orgId: string) {
    const isId = Types.ObjectId.isValid(orgId);
    const org = await this.orgModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(orgId) : null }, { slug: orgId }],
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.memberModel
      .find({ organizationId: org._id })
      .populate('userId', 'username email country')
      .exec();
  }

  // -------------------------------------------------------------
  // Team Management
  // -------------------------------------------------------------
  async createTeam(
    orgId: string,
    captainUserId: string,
    data: { name: string; tag: string; description?: string },
  ) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');

    const existing = await this.teamModel.findOne({ organizationId: org._id, name: data.name });
    if (existing) throw new ConflictException('A team with this name already exists in this organization.');

    const team = new this.teamModel({
      organizationId: org._id,
      name: data.name,
      tag: data.tag.toUpperCase(),
      description: data.description || '',
      captainUserId: new Types.ObjectId(captainUserId),
      members: [new Types.ObjectId(captainUserId)],
    });
    await team.save();

    // Assign TEAM_CAPTAIN role to captain
    await this.userModel.findByIdAndUpdate(captainUserId, {
      $addToSet: { roles: UserRole.TEAM_CAPTAIN },
    });

    return team;
  }

  async getTeams(orgId: string) {
    const isId = Types.ObjectId.isValid(orgId);
    const org = await this.orgModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(orgId) : null }, { slug: orgId }],
    });
    if (!org) throw new NotFoundException('Organization not found');

    return this.teamModel
      .find({ organizationId: org._id })
      .populate('captainUserId', 'username')
      .populate('members', 'username')
      .exec();
  }

  async addTeamMember(teamId: string, callerUserId: string, targetUserId: string) {
    const team = await this.teamModel.findById(teamId);
    if (!team) throw new NotFoundException('Team not found');

    const callerUser = await this.userModel.findById(callerUserId);
    const isSuperAdmin = callerUser?.roles?.includes(UserRole.SUPER_ADMIN);
    const isCaptain = team.captainUserId?.toString() === callerUserId;
    if (!isCaptain && !isSuperAdmin) {
      const org = await this.orgModel.findById(team.organizationId);
      if (org) {
        await this.assertOrgAdmin(org, callerUserId);
      } else {
        throw new ForbiddenException('You do not have permission to add members to this team.');
      }
    }

    const userObjId = new Types.ObjectId(targetUserId) as any;
    if (!team.members.some(m => m.toString() === targetUserId)) {
      team.members.push(userObjId);
      await team.save();
    }
    return team;
  }

  // -------------------------------------------------------------
  // Organization Analytics
  // -------------------------------------------------------------
  async getAnalytics(orgId: string) {
    const isId = Types.ObjectId.isValid(orgId);
    const org = await this.orgModel.findOne({
      $or: [{ _id: isId ? new Types.ObjectId(orgId) : null }, { slug: orgId }],
    });
    if (!org) throw new NotFoundException('Organization not found');

    const teamsCount = await this.teamModel.countDocuments({ organizationId: org._id });
    const approvedMembers = await this.memberModel.countDocuments({
      organizationId: org._id,
      status: MembershipStatus.APPROVED,
    });
    const pendingRequests = await this.memberModel.countDocuments({
      organizationId: org._id,
      status: MembershipStatus.PENDING,
    });

    return {
      organization: {
        id: org._id,
        name: org.name,
        slug: org.slug,
        isVerified: org.isVerified,
      },
      stats: {
        memberCount: approvedMembers,
        pendingRequests,
        teamsCount,
        averageTeamWpm: 78,
        totalTrophies: 12,
      },
    };
  }

  // -------------------------------------------------------------
  // Super Admin Organization Oversight
  // -------------------------------------------------------------
  async verifyOrganization(
    orgId: string,
    isVerified: boolean,
    reason?: string,
    actor?: { userId?: string; username?: string },
  ) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');
    org.isVerified = isVerified;
    const saved = await org.save();

    if (this.auditService) {
      await this.auditService.logAction({
        actorId: actor?.userId,
        actorUsername: actor?.username || 'SUPER_ADMIN',
        action: isVerified ? 'ORG_VERIFIED' : 'ORG_VERIFICATION_REVOKED',
        resource: 'ORGANIZATION',
        resourceId: org._id.toString(),
        details: { orgName: org.name, slug: org.slug, isVerified, reason },
      });
    }

    return { success: true, organization: saved, reason };
  }

  async updateOrganizationStatus(
    orgId: string,
    isSuspended: boolean,
    reason?: string,
    actor?: { userId?: string; username?: string },
  ) {
    const org = await this.orgModel.findById(orgId);
    if (!org) throw new NotFoundException('Organization not found');
    (org as any).isSuspended = isSuspended;
    const saved = await org.save();

    if (this.auditService) {
      await this.auditService.logAction({
        actorId: actor?.userId,
        actorUsername: actor?.username || 'SUPER_ADMIN',
        action: isSuspended ? 'ORG_SUSPENDED' : 'ORG_REACTIVATED',
        resource: 'ORGANIZATION',
        resourceId: org._id.toString(),
        details: { orgName: org.name, slug: org.slug, isSuspended, reason },
      });
    }

    return { success: true, organization: saved, isSuspended, reason };
  }
}
