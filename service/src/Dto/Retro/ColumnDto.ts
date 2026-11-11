import {Transform} from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/** Trimmed, and an empty text means none: clearing the field clears the prompt. */
const trimToNull = ({value}: {value: unknown}) => {
  const trimmed = typeof value === 'string' ? value.trim() : value;

  return trimmed === '' ? null : trimmed;
};

export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  public title!: string;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(140)
  public prompt?: string | null;
}

/** At least one of the two; the manager refuses an empty change. */
export class UpdateColumnDto {
  @ValidateIf((dto: UpdateColumnDto) => dto.title !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  public title?: string;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(140)
  public prompt?: string | null;
}

export class ReorderColumnsDto {
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({each: true})
  public columnIds!: string[];
}
