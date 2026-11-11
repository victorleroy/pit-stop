import {IsIn, IsString, ValidateIf} from 'class-validator';
import {ICEBREAKER_ACTIONS} from '~/Manager/IcebreakerManager';

/** Lengths are checked by the manager, after trimming. */
export class IcebreakerCommandDto {
  @IsIn(ICEBREAKER_ACTIONS as unknown as string[])
  public action!: string;

  @ValidateIf((dto: IcebreakerCommandDto) => dto.action === 'custom')
  @IsString()
  public text?: string;
}

export class IcebreakerAnswerDto {
  @IsString()
  public text!: string;
}
