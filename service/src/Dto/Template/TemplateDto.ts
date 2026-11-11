import {Transform, Type} from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

const trim = ({value}: {value: unknown}) => (typeof value === 'string' ? value.trim() : value);

/** Trimmed, and an empty text means none: a blank prompt is no prompt. */
const trimToNull = ({value}: {value: unknown}) => {
  const trimmed = trim({value});

  return trimmed === '' ? null : trimmed;
};

export class TemplateColumnDto {
  @Transform(trim)
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

export class TemplateDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name!: string;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public description?: string | null;

  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({each: true})
  @Type(() => TemplateColumnDto)
  public columns!: TemplateColumnDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  public maxVotes?: number | null;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(3600)
  public timerSeconds?: number | null;
}

export class DuplicateTemplateDto {
  @IsString()
  @IsNotEmpty()
  public sourceTemplateId!: string;

  @Transform(trim)
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name?: string;
}

export class SaveAsTemplateDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name!: string;

  @Transform(trimToNull)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public description?: string | null;
}

export class DefaultTemplateDto {
  // null goes back to Start / Stop / Continue; leaving it out is not a choice.
  @ValidateIf((dto: DefaultTemplateDto) => dto.templateId !== null)
  @IsString()
  @IsNotEmpty()
  public templateId!: string | null;
}
