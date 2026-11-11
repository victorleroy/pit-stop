import {IsString} from 'class-validator';

/** The length is checked by the manager, after trimming. */
export class IcebreakerAnswerDto {
  @IsString()
  public text!: string;
}
