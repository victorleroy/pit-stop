export type TemplateScope = 'BUILTIN' | 'TEAM';

export interface TemplateColumnModel {
  prompt: string | null;
  title: string;
}

export interface TemplateModel {
  columns: TemplateColumnModel[];
  description: string | null;
  /** `builtin:<slug>` for the catalogue, a UUID for a team template. */
  id: string;
  maxVotes: number | null;
  name: string;
  scope: TemplateScope;
  timerSeconds: number | null;
  /** TEAM only: last write wins, and this says whose it was. */
  updatedAt?: string;
  updatedBy?: {id: string; name: string};
}

export interface TeamTemplatesModel {
  builtin: TemplateModel[];
  /** Never null: the team's choice, or Start / Stop / Continue. */
  defaultTemplateId: string;
  team: TemplateModel[];
}
