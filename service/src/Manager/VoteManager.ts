import type {RetroPhase} from '~/Db/schema';
import {ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {RetroManager} from '~/Manager/RetroManager';
import type {BoardModel} from '~/Model/RetroModel';
import type {BoardData, BoardRepository} from '~/Repository/BoardRepository';
import type {VoteRepository} from '~/Repository/VoteRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

const VOTING_PHASES: RetroPhase[] = ['VOTE'];

export class VoteManager {
  public constructor(
    private readonly voteRepository: VoteRepository,
    private readonly boardRepository: BoardRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly retroManager: RetroManager,
  ) {}

  public async cast(
    auth: AuthContext,
    retroId: string,
    targetId: string,
    delta: number,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, VOTING_PHASES);

    const data = await this.boardRepository.loadBoard(retro);

    VoteManager.checkTargetExists(data, targetId);

    const myVotes = data.votes.filter((vote) => vote.userId === auth.userId);

    const onTarget = myVotes.find((vote) => vote.targetId === targetId)?.count ?? 0;
    const used = myVotes.reduce((total, vote) => total + vote.count, 0);

    if (delta > 0 && used + delta > retro.maxVotes) {
      throw new ConflictHttpError(`No vote left: ${retro.maxVotes} already spent`);
    }

    if (delta < 0 && onTarget + delta < 0) {
      throw new ConflictHttpError('No vote to take back on this card');
    }

    if (onTarget + delta === 0) {
      await this.voteRepository.remove(retroId, auth.userId, targetId);
    } else {
      await this.voteRepository.addToCount(retroId, auth.userId, targetId, delta);
    }

    return this.retroManager.getBoard(auth, retroId);
  }

  /** A vote can only land on a standalone note or on a cluster, never on a clustered note. */
  private static checkTargetExists(data: BoardData, targetId: string): void {
    if (data.clusters.some(({id}) => id === targetId)) {
      return;
    }

    const note = data.notes.find(({id}) => id === targetId);

    if (!note) {
      throw new NotFoundHttpError(`Card "${targetId}" not found`);
    }

    if (note.clusterId) {
      throw new ConflictHttpError('Vote for the cluster, not for a note inside it');
    }
  }
}
