import type {RetroPhase} from '~/Db/schema';
import {ConflictHttpError, ForbiddenHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {MembershipRepository} from '~/Repository/MembershipRepository';
import type {RetroRow} from '~/Repository/BoardRepository';
import type {RetroRepository} from '~/Repository/RetroRepository';
import type {AuthContext} from '~/Security/AuthContext';

export interface RetroAccess {
  isFacilitator: boolean;
  retro: RetroRow;
}

export class RetroAccessChecker {
  public constructor(
    private readonly retroRepository: RetroRepository,
    private readonly membershipRepository: MembershipRepository,
  ) {}

  public async checkTeamAccess(auth: AuthContext, teamId: string): Promise<void> {
    const membership = await this.membershipRepository.findOne(teamId, auth.userId);

    if (!membership) {
      throw new ForbiddenHttpError('You are not a member of this team');
    }
  }

  /**
   * The org check is carried by the scoped accessor: a retro belonging to another
   * organisation is simply not found, so its existence is never disclosed.
   */
  public async checkRetroAccess(auth: AuthContext, retroId: string): Promise<RetroAccess> {
    const retro = await this.retroRepository.findOneById(auth.db, retroId);

    if (!retro) {
      throw new NotFoundHttpError(`Retro "${retroId}" not found`);
    }

    await this.checkTeamAccess(auth, retro.teamId);

    return {isFacilitator: retro.facilitatorId === auth.userId, retro};
  }

  public async checkFacilitatorAccess(auth: AuthContext, retroId: string): Promise<RetroAccess> {
    const access = await this.checkRetroAccess(auth, retroId);

    if (!access.isFacilitator) {
      throw new ForbiddenHttpError('Only the facilitator can change the retro');
    }

    return access;
  }

  public static checkPhaseAllows(phase: RetroPhase, allowed: RetroPhase[]): void {
    // An archived retro refuses every change with a conflict: reopening it is the way out.
    if (phase === 'ARCHIVED' && !allowed.includes(phase)) {
      throw new ConflictHttpError('Reopen the retro before changing it');
    }

    if (!allowed.includes(phase)) {
      throw new ForbiddenHttpError(`Action not allowed during the "${phase}" phase`);
    }
  }
}
