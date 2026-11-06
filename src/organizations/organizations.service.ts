import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Organization, OrganizationDocument } from './schemas/organization.schema';
import { User, UserDocument, UserRole } from '../users/schemas/user.schema';

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectModel(Organization.name) private orgModel: Model<OrganizationDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
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
            ownerId: '672439a90b00000000000001',
            memberCount: 48,
          },
          {
            name: 'BUET Computer Science Community',
            slug: 'buet-cse-community',
            type: 'UNIVERSITY',
            country: 'BD',
            website: 'https://cse.buet.ac.bd',
            isVerified: true,
            ownerId: '672439a90b00000000000001',
            memberCount: 65,
          },
        ]);
      }
    } catch (e) {
      // In-memory or startup note
    }
  }

  async getAllOrganizations() {
    return this.orgModel.find().sort({ memberCount: -1 });
  }

  async getOrganizationBySlug(slug: string) {
    const org = await this.orgModel.findOne({ slug });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  async createOrganization(
    ownerId: string,
    data: { name: string; type?: string; country?: string; website?: string },
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
      isVerified: false,
      ownerId,
      memberCount: 1,
    });
    await org.save();

    // Assign ORGANIZATION_ADMIN role to owner
    await this.userModel.findByIdAndUpdate(ownerId, {
      $addToSet: { roles: UserRole.ORGANIZATION_ADMIN },
      organizationId: org._id,
    });

    return org;
  }
}
