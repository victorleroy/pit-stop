import {Type} from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {RETRO_PHASES} from '~/Db/schema';
import {TIMER_ACTIONS} from '~/Model/TimerModel';

export class TimerCommandDto {
  @IsIn(TIMER_ACTIONS as unknown as string[])
  public action!: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  public seconds?: number;
}

export class UpdateRetroDto {
  @IsOptional()
  @IsIn(RETRO_PHASES as unknown as string[])
  public phase?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  public title?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => TimerCommandDto)
  public timer?: TimerCommandDto;
}
