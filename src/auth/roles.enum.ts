/**
 * KEYRUSH 2.0 Consolidated Role System
 * Primary Roles:
 * - USER: Standard typing esports competitor
 * - ORGANIZER: Tournament & organization manager
 * - SUPER_ADMIN: Global platform authority
 *
 * Backward-compatible aliases preserved for existing tokens and database records.
 */
export enum UserRole {
  GUEST = 'GUEST',
  USER = 'USER',
  PLAYER = 'PLAYER', // Backward-compatible alias for USER
  TEAM_CAPTAIN = 'TEAM_CAPTAIN',
  ORGANIZER = 'ORGANIZER',
  ORGANIZATION_ADMIN = 'ORGANIZATION_ADMIN', // Backward-compatible alias for ORGANIZER
  ORGANIZATION_MODERATOR = 'ORGANIZATION_MODERATOR', // Backward-compatible alias for ORGANIZER
  COMPETITION_ADMIN = 'COMPETITION_ADMIN', // Backward-compatible alias for ORGANIZER
  PLATFORM_MODERATOR = 'PLATFORM_MODERATOR', // Backward-compatible alias for SUPER_ADMIN
  SUPER_ADMIN = 'SUPER_ADMIN',
}

/**
 * Normalizes any legacy or alias role string into the corresponding canonical 2.0 role.
 */
export function normalizeRole(role: string): string {
  switch (role) {
    case UserRole.PLAYER:
    case UserRole.USER:
      return UserRole.USER;
    case UserRole.ORGANIZATION_ADMIN:
    case UserRole.ORGANIZATION_MODERATOR:
    case UserRole.COMPETITION_ADMIN:
    case UserRole.ORGANIZER:
      return UserRole.ORGANIZER;
    case UserRole.PLATFORM_MODERATOR:
    case UserRole.SUPER_ADMIN:
      return UserRole.SUPER_ADMIN;
    default:
      return role;
  }
}

