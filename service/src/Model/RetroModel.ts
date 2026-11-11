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
  /** One line telling people what goes in the column, copied from the template. */
  prompt: string | null;
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

export type IcebreakerCategoryModel = 'FUN';

/** A bank question travels in both languages: the reader's browser picks one. */
export type IcebreakerQuestionModel =
  | {category: IcebreakerCategoryModel; id: string; source: 'BANK'; text: {en: string; fr: string}}
  | {source: 'CUSTOM'; text: string};

export interface IcebreakerAnswerModel {
  /** Always present: answers are signed. */
  author: NoteAuthorModel;
  mine: boolean;
  /** Empty until the answers are revealed, except for the author's own. */
  text: string;
}

export interface IcebreakerModel {
  answeredCount: number;
  /** Oldest first. */
  answers: IcebreakerAnswerModel[];
  answersRevealed: boolean;
  /** Null for everyone but the facilitator until the question is asked. */
  question: IcebreakerQuestionModel | null;
  /** WAITING exists in LOBBY only: drawn, not asked yet. */
  state: 'ASKED' | 'WAITING';
}

export interface BoardModel extends RetroSummaryModel {
  /** Actions decided during this retro. */
  actions: ActionModel[];
  /** Still-open actions inherited from the previous retros of the team. */
  carriedOverActions: ActionModel[];
  columns: ColumnModel[];
  /** Suggested timer duration, copied from the template; the facilitator still picks. */
  defaultTimerSeconds: number | null;
  /** Not protected content: who facilitates already shows through the takeover rule. */
  facilitatorId: string;
  /** Null when the retro has no question, or one that was never asked and the retro moved on. */
  icebreaker: IcebreakerModel | null;
  maxVotes: number;
  /** Whether the caller has shared the text of their notes. */
  myNotesRevealed: boolean;
  myVotesLeft: number;
  /** The actions to review in this retro: carried over, or already reviewed here. */
  review: ReviewModel;
  teamId: string;
  /** The template the retro was created from, as it was named then. */
  template: {id: string; name: string} | null;
  timer: TimerModel;
  /** Votes spent per userId, only during VOTE (empty otherwise). Never what they went to. */
  voteProgress: Record<string, number>;
  votesRevealed: boolean;
}
