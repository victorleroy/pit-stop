import {IsIn, IsOptional, IsString, MaxLength, ValidateIf} from 'class-validator';
import {ACTION_REVIEW_OUTCOMES} from '~/Db/schema';

export class ReviewOutcomeDto {
  @IsIn(ACTION_REVIEW_OUTCOMES as unknown as string[])
  public outcome!: string;

  /** Trimmed by the manager; an empty comment is stored as none. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @MaxLength(300)
  public comment?: string | null;
}
