import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole, normalizeRole } from '../roles.enum';

const ROLE_HIERARCHY: Record<string, number> = {
  [UserRole.GUEST]: 0,
  [UserRole.USER]: 10,
  [UserRole.PLAYER]: 10,
  [UserRole.TEAM_CAPTAIN]: 20,
  [UserRole.ORGANIZATION_MODERATOR]: 30,
  [UserRole.ORGANIZER]: 40,
  [UserRole.ORGANIZATION_ADMIN]: 40,
  [UserRole.COMPETITION_ADMIN]: 50,
  [UserRole.PLATFORM_MODERATOR]: 60,
  [UserRole.SUPER_ADMIN]: 100,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.roles || user.roles.length === 0) {
      throw new ForbiddenException('User lacks necessary permissions');
    }

    // Super Admin bypasses all checks
    if (user.roles.includes(UserRole.SUPER_ADMIN) || user.roles.map(normalizeRole).includes(UserRole.SUPER_ADMIN)) {
      return true;
    }

    // Direct role match or canonical match
    const userCanonicalRoles = user.roles.map((r: string) => normalizeRole(r));
    const requiredCanonicalRoles = requiredRoles.map((r) => normalizeRole(r));

    const hasDirectRole = requiredRoles.some((role) => user.roles.includes(role));
    const hasCanonicalRole = requiredCanonicalRoles.some((role) => userCanonicalRoles.includes(role));
    if (hasDirectRole || hasCanonicalRole) return true;

    // Hierarchy check: Find user's highest role level
    const userMaxLevel = Math.max(...user.roles.map((r: string) => ROLE_HIERARCHY[r] || 0));
    const minRequiredLevel = Math.min(...requiredRoles.map((r) => ROLE_HIERARCHY[r] || 100));

    if (userMaxLevel >= minRequiredLevel && minRequiredLevel <= 20) {
      return true;
    }

    throw new ForbiddenException(`Access denied. Required role(s): ${requiredRoles.join(', ')}`);
  }
}
