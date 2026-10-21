import {IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf} from 'class-validator';
import {ACTION_STATUSES} from '~/Db/schema';

export class CreateActionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  public text!: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public assigneeId?: string;
}

export class UpdateActionDto {
  @IsOptional()
  @IsIn(ACTION_STATUSES as unknown as string[])
  public status?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  public text?: string;

  /** null unassigns the action. */
  @IsOptional()
  @ValidateIf((_object, value) => value !== null)
  @IsString()
  @IsNotEmpty()
  public assigneeId?: string | null;
}

export class ActionPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public actionId!: string;

  @IsString()
  @IsNotEmpty()
  public teamId!: string;
}
