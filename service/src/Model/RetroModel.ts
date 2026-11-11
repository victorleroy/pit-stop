import type {RetroPhase} from '~/Db/schema';
import type {ActionModel, ReviewModel} from '~/Model/ActionModel';
import type {TimerModel} from '~/Model/TimerModel';

export interface NoteAuthorModel {
  id: string;
  name: string;
  pictureUrl?: string;
}

export interface NoteModel {
  /** Always present: a retro hides what was written, never who was in the room. */
  author: NoteAuthorModel;
  columnId: string;
  createdAt?: string;
  id: string;
  isMine: boolean;
  /** False means the text is withheld and `text` is empty. */
  revealed: boolean;
  text: string;
}

/** A card is either a standalone note or a cluster holding several notes. */
export interface CardModel {
  id: string;
  myVotes: number;
  notes: NoteModel[];
  title?: string;
  totalVotes?: number;
  type: 'cluster' | 'note';
}

export interface ColumnModel {
  cards: CardModel[];
  id: string;
  order: number;
  title: string;
}

export interface TeamRetroSummaryModel extends RetroSummaryModel {
  teamId: string;
  teamName: string;
}

export interface RetroSummaryModel {
  createdAt?: string;
  createdBy: string;
  id: string;
  isFacilitator: boolean;
  phase: RetroPhase;
  title: string;
}

export interface BoardModel extends RetroSummaryModel {
  /** Actions decided during this retro. */
  actions: ActionModel[];
  /** Still-open actions inherited from the previous retros of the team. */
  carriedOverActions: ActionModel[];
  columns: ColumnModel[];
  maxVotes: number;
  /** Whether the caller has shared the text of their notes. */
  myNotesRevealed: boolean;
  myVotesLeft: number;
  /** The actions to review in this retro: carried over, or already reviewed here. */
  review: ReviewModel;
  teamId: string;
  timer: TimerModel;
  /** Votes spent per userId, only during VOTE (empty otherwise). Never what they went to. */
  voteProgress: Record<string, number>;
  votesRevealed: boolean;
}
