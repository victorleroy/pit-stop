import {v4 as uuid} from 'uuid';
import type {RetroPhase} from '~/Db/schema';
import {ConflictHttpError, NotFoundHttpError} from '~/Error/HttpError';
import type {RetroManager} from '~/Manager/RetroManager';
import type {BoardModel} from '~/Model/RetroModel';
import type {BoardRepository} from '~/Repository/BoardRepository';
import type {ClusterRepository} from '~/Repository/ClusterRepository';
import type {NoteRepository} from '~/Repository/NoteRepository';
import type {AuthContext} from '~/Security/AuthContext';
import {RetroAccessChecker} from '~/Security/RetroAccessChecker';

/**
 * Grouping is limited to the sharing phase on purpose: once votes are cast they belong
 * to a card, and moving notes around would silently move other people's votes.
 */
const GROUPING_PHASES: RetroPhase[] = ['SHARE'];

const MIN_CLUSTER_SIZE = 2;

export class ClusterManager {
  public constructor(
    private readonly clusterRepository: ClusterRepository,
    private readonly noteRepository: NoteRepository,
    private readonly boardRepository: BoardRepository,
    private readonly accessChecker: RetroAccessChecker,
    private readonly retroManager: RetroManager,
  ) {}

  public async group(
    auth: AuthContext,
    retroId: string,
    noteId: string,
    targetId: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, GROUPING_PHASES);

    if (noteId === targetId) {
      throw new ConflictHttpError('A note cannot be grouped with itself');
    }

    const data = await this.boardRepository.loadBoard(retro);
    const note = data.notes.find(({id}) => id === noteId);

    if (!note) {
      throw new NotFoundHttpError(`Note "${noteId}" not found`);
    }

    const targetCluster = data.clusters.find(({id}) => id === targetId);
    const targetNote = data.notes.find(({id}) => id === targetId);

    if (targetCluster) {
      if (targetCluster.columnId !== note.columnId) {
        throw new ConflictHttpError('Notes can only be grouped inside the same column');
      }

      await this.noteRepository.update(retroId, noteId, {clusterId: targetCluster.id});
      await this.clusterRepository.dissolveUndersized(retroId);

      return this.retroManager.getBoard(auth, retroId);
    }

    if (!targetNote) {
      throw new NotFoundHttpError(`Target "${targetId}" not found`);
    }

    if (targetNote.columnId !== note.columnId) {
      throw new ConflictHttpError('Notes can only be grouped inside the same column');
    }

    const clusterId = targetNote.clusterId ?? uuid();

    if (!targetNote.clusterId) {
      await this.clusterRepository.create({columnId: note.columnId, id: clusterId, retroId});
      await this.noteRepository.update(retroId, targetNote.id, {clusterId});
    }

    await this.noteRepository.update(retroId, noteId, {clusterId});
    // The note may have left another cluster with a single note in it.
    await this.clusterRepository.dissolveUndersized(retroId);

    return this.retroManager.getBoard(auth, retroId);
  }

  public async ungroup(auth: AuthContext, retroId: string, noteId: string): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, GROUPING_PHASES);

    const data = await this.boardRepository.loadBoard(retro);
    const note = data.notes.find(({id}) => id === noteId);

    if (!note?.clusterId) {
      throw new ConflictHttpError(`Note "${noteId}" does not belong to a cluster`);
    }

    const {clusterId} = note;

    await this.noteRepository.update(retroId, noteId, {clusterId: null});

    const remaining = data.notes.filter(
      (item) => item.clusterId === clusterId && item.id !== noteId,
    );

    // A cluster of one is just a note: dissolve it rather than keep an empty shell.
    if (remaining.length < MIN_CLUSTER_SIZE) {
      await this.noteRepository.clearClusterFor(
        retroId,
        remaining.map(({id}) => id),
      );
      await this.clusterRepository.remove(retroId, clusterId);
    }

    return this.retroManager.getBoard(auth, retroId);
  }

  public async rename(
    auth: AuthContext,
    retroId: string,
    clusterId: string,
    title: string,
  ): Promise<BoardModel> {
    const {retro} = await this.accessChecker.checkRetroAccess(auth, retroId);
    RetroAccessChecker.checkPhaseAllows(retro.phase, GROUPING_PHASES);

    const cluster = await this.clusterRepository.findOneById(retroId, clusterId);

    if (!cluster) {
      throw new NotFoundHttpError(`Cluster "${clusterId}" not found`);
    }

    await this.clusterRepository.rename(retroId, clusterId, title);

    return this.retroManager.getBoard(auth, retroId);
  }
}
