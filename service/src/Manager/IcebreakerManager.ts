import type {RetroPhase} from '~/Db/schema';
import {BadRequestHttpError} from '~/Error/HttpError';
import {drawIcebreakerQuestion} from '~/Icebreaker/drawQuestion';
import {ICEBREAKER_QUESTIONS} from '~/Icebreaker/questions';
import {RetroManager} from '~/Manager/RetroManager';
import type {BoardModel} from '~/Model/RetroModel';
import type {BoardRepository, RetroRow} from '~/Repository/BoardRepository';
import type {IcebreakerAnswerRepository} from '~/Repository/IcebreakerAnswerRepository';
import type {RetroRepository, UpdateRetroInput} from '~/Repository/RetroRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

export const ICEBREAKER_ACTIONS = ['draw', 'custom', 'revealAnswers', 'hideAnswers'] as const;
export type IcebreakerAction = (typeof ICEBREAKER_ACTIONS)[number];

/** The question is chosen in the waiting room, and can still change once asked. */
const QUESTION_PHASES: RetroPhase[] = ['LOBBY', 'ICEBREAKER'];

/** Answers exist while the question is on screen, and only then. */
const ANSWER_PHASES: RetroPhase[] = ['ICEBREAKER'];

export const ICEBREAKER_CUSTOM_MAX = 200;
export const ICEBREAKER_ANSWER_MAX = 140;

/**
 * One light question at the start of a retro (BEHAVIOUR.md section 6). The facilitator picks
 * it, entering ICEBREAKER asks it (RetroManager.updateRetro), and everyone may answer in one
 * line, signed, hidden until the facilitator reveals the answers.
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
   * team holds. A question skipped by a new draw or never asked stays available.
   */
  public async drawFor(
    auth: AuthContext,
    retro: Pick<RetroRow, 'icebreakerQuestionId' | 'id' | 'teamId'>,
  ): Promise<string> {
    const usage = await this.retroRepository.findIcebreakerUsage(auth.db, retro.teamId);

    return drawIcebreakerQuestion({
      askedIds: new Set(usage.filter(({askedAt}) => askedAt !== null).map(({questionId}) => questionId)),
      bank: ICEBREAKER_QUESTIONS,
      currentId: retro.icebreakerQuestionId,
      random: this.random,
      reservedIds: new Set(
        usage
          .filter(({askedAt, phase, retroId}) => retroId !== retro.id && phase === 'LOBBY' && !askedAt)
          .map(({questionId}) => questionId),
      ),
    }).id;
  }

  public async command(
    auth: AuthContext,
    retroId: string,
    action: IcebreakerAction,
    rawText?: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkFacilitatorAccess(auth, retroId);

    if (action === 'revealAnswers' || action === 'hideAnswers') {
      RetroAccessChecker.checkPhaseAllows(retro.phase, ANSWER_PHASES);
      await this.retroRepository.update(retroId, {
        icebreakerAnswersRevealed: action === 'revealAnswers' ? 1 : 0,
      });

      return this.board(auth, retroId);
    }

    RetroAccessChecker.checkPhaseAllows(retro.phase, QUESTION_PHASES);

    let question: UpdateRetroInput;

    if (action === 'custom') {
      const text = rawText?.trim() ?? '';

      if (!text || text.length > ICEBREAKER_CUSTOM_MAX) {
        throw new BadRequestHttpError(`The question takes 1 to ${ICEBREAKER_CUSTOM_MAX} characters`);
      }

      question = {icebreakerCustomText: text, icebreakerQuestionId: null};
    } else {
      question = {icebreakerCustomText: null, icebreakerQuestionId: await this.drawFor(auth, retro)};
    }

    // Answers belong to the question they answered: a new question starts the round over.
    if (retro.icebreakerAskedAt) {
      await this.answerRepository.removeAllByRetroId(retroId);
      question.icebreakerAnswersRevealed = 0;
    }

    await this.retroRepository.update(retroId, question);

    return this.board(auth, retroId);
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
