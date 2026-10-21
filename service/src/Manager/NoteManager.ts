import {v4 as uuid} from 'uuid';
import type {RetroPhase} from '~/Db/schema';
import {ForbiddenHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {RetroManager} from '~/Manager/RetroManager';
import type {BoardModel} from '~/Model/RetroModel';
import type {ClusterRepository} from '~/Repository/ClusterRepository';
import type {ColumnRepository} from '~/Repository/ColumnRepository';
import type {NoteRepository} from '~/Repository/NoteRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

/** Writing happens during the brainstorm, and what is written there stays as written. */
const WRITABLE_PHASES: RetroPhase[] = ['BRAINSTORM'];

/** Moving a note into a group, or throwing away a duplicate, goes on while sharing. */
const MODERATION_PHASES: RetroPhase[] = ['BRAINSTORM', 'SHARE'];

const REVEALABLE_PHASES: RetroPhase[] = ['SHARE', 'VOTE', 'DISCUSS'];

export class NoteManager {
  public constructor(
    private readonly noteRepository: NoteRepository,
    private readonly columnRepository: ColumnRepository,
    private readonly clusterRepository: ClusterRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly retroManager: RetroManager,
  ) {}

  public async create(
    auth: AuthContext,
    retroId: string,
    columnId: string,
    text: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, WRITABLE_PHASES);

    const column = await this.columnRepository.findOneById(retroId, columnId);

    if (!column) {
      throw new NotFoundHttpError(`Column "${columnId}" not found`);
    }

    await this.noteRepository.create({authorId: auth.userId, columnId, id: uuid(), retroId, text});

    return this.retroManager.getBoard(auth, retroId);
  }

  public async update(
    auth: AuthContext,
    retroId: string,
    noteId: string,
    changes: {columnId?: string; text?: string},
  ): Promise<BoardModel> {
    const {isFacilitator, retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(
      retro.phase,
      changes.text === undefined ? MODERATION_PHASES : WRITABLE_PHASES,
    );

    const note = await this.getEditableNote(auth, retroId, noteId, isFacilitator);

    // The facilitator moderates a board they cannot read: moving or deleting a withheld note
    // is fine, rewriting it would replace a text they were never given.
    if (changes.text !== undefined && note.authorId !== auth.userId && !note.revealed) {
      throw new ForbiddenHttpError('This note has not been shared yet');
    }

    if (changes.columnId && changes.columnId !== note.columnId) {
      const column = await this.columnRepository.findOneById(retroId, changes.columnId);

      if (!column) {
        throw new NotFoundHttpError(`Column "${changes.columnId}" not found`);
      }
    }

    const movesColumn = Boolean(changes.columnId && changes.columnId !== note.columnId);

    // A cluster lives in one column: a note moving out leaves its cluster behind.
    await this.noteRepository.update(retroId, noteId, {
      ...(changes.columnId ? {columnId: changes.columnId} : {}),
      ...(movesColumn ? {clusterId: null} : {}),
      ...(changes.text ? {text: changes.text} : {}),
    });

    if (movesColumn) {
      await this.clusterRepository.dissolveUndersized(retroId);
    }

    return this.retroManager.getBoard(auth, retroId);
  }

  public async remove(auth: AuthContext, retroId: string, noteId: string): Promise<BoardModel> {
    const {isFacilitator, retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, MODERATION_PHASES);

    await this.getEditableNote(auth, retroId, noteId, isFacilitator);
    await this.noteRepository.remove(retroId, noteId);
    await this.clusterRepository.dissolveUndersized(retroId);

    return this.retroManager.getBoard(auth, retroId);
  }

  /**
   * Sharing is reversible: somebody who shared too early has to be able to take the text
   * back, and nothing downstream depends on a note having been read once.
   */
  public async setMineRevealed(
    auth: AuthContext,
    retroId: string,
    revealed: boolean,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, REVEALABLE_PHASES);

    await this.noteRepository.setRevealedByAuthor(retroId, auth.userId, revealed);

    return this.retroManager.getBoard(auth, retroId);
  }

  /**
   * The author edits their own notes; the facilitator can also clean up the board
   * (duplicates, off-topic, typos) without knowing who wrote what.
   */
  private async getEditableNote(
    auth: AuthContext,
    retroId: string,
    noteId: string,
    isFacilitator: boolean,
  ) {
    const note = await this.noteRepository.findOneById(retroId, noteId);

    if (!note) {
      throw new NotFoundHttpError(`Note "${noteId}" not found`);
    }

    if (note.authorId !== auth.userId && !isFacilitator) {
      throw new ForbiddenHttpError('Only the author or the facilitator can change this note');
    }

    return note;
  }
}
