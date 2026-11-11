import type {RetroPhase} from '~/Db/schema';
import {BadRequestHttpError, NotFoundHttpError} from '~/Error/HttpError';
import {drawIcebreakerQuestion} from '~/Icebreaker/drawQuestion';
import {ICEBREAKER_QUESTIONS} from '~/Icebreaker/questions';
import {RetroManager} from '~/Manager/RetroManager';
import type {BoardModel} from '~/Model/RetroModel';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import type {IcebreakerAnswerRepository} from '~/Repository/IcebreakerAnswerRepository';
import type {RetroRepository} from '~/Repository/RetroRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

/** Answers exist while the question is on screen, and only then. */
const ANSWER_PHASES: RetroPhase[] = ['ICEBREAKER'];

export const ICEBREAKER_ANSWER_MAX = 140;

/**
 * One light question at the start of a retro (BEHAVIOUR.md section 6), drawn from the bank and
 * asked on entering ICEBREAKER (RetroManager.updateRetro). Everyone may answer on one post-it,
 * signed, which its author shows or hides like a note.
 */
export class IcebreakerManager {
  public constructor(
    private readonly retroRepository: RetroRepository,
    private readonly answerRepository: IcebreakerAnswerRepository,
    private readonly boardRepository: BoardRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly random: () => number = () => Math.random(),
  ) {}

  /**
   * A bank question the team has not been asked yet, and that no other waiting room of the
   * team holds. A question never asked stays available.
   */
  public async drawFor(
    auth: AuthContext,
    retro: Pick<RetroRow, 'id' | 'teamId'>,
  ): Promise<string> {
    const usage = await this.retroRepository.findIcebreakerUsage(auth.db, retro.teamId);

    return drawIcebreakerQuestion({
      askedIds: new Set(usage.filter(({askedAt}) => askedAt !== null).map(({questionId}) => questionId)),
      bank: ICEBREAKER_QUESTIONS,
      random: this.random,
      reservedIds: new Set(
        usage
          .filter(({askedAt, phase, retroId}) => retroId !== retro.id && phase === 'LOBBY' && !askedAt)
          .map(({questionId}) => questionId),
      ),
    }).id;
  }

  /** Creates or replaces the caller's own answer. */
  public async answer(auth: AuthContext, retroId: string, rawText: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, ANSWER_PHASES);

    const text = rawText.trim();

    if (!text || text.length > ICEBREAKER_ANSWER_MAX) {
      throw new BadRequestHttpError(`An answer takes 1 to ${ICEBREAKER_ANSWER_MAX} characters`);
    }

    await this.answerRepository.upsert(retroId, auth.userId, text);

    return this.board(auth, retroId);
  }

  /** The author alone shows or hides their post-it; idempotent. */
  public async setRevealed(auth: AuthContext, retroId: string, revealed: boolean): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, ANSWER_PHASES);

    if (!(await this.answerRepository.setRevealed(retroId, auth.userId, revealed))) {
      throw new NotFoundHttpError('Answer the icebreaker first');
    }

    return this.board(auth, retroId);
  }

  /** Idempotent: removing an answer that is not there changes nothing. */
  public async removeAnswer(auth: AuthContext, retroId: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, ANSWER_PHASES);

    await this.answerRepository.remove(retroId, auth.userId);

    return this.board(auth, retroId);
  }

  private async board(auth: AuthContext, retroId: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);

    return RetroManager.projectBoard(await this.boardRepository.loadBoard(retro), auth.userId);
  }
}
