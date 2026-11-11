import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateRetroDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  public title!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({each: true})
  @MaxLength(40, {each: true})
  public columns?: string[];

  // builtin:<slug> or a template of the team; never together with `columns`.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public templateId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  public maxVotes?: number;

  // Left out, the retro has no icebreaker; the web always sends the box it shows.
  @IsOptional()
  @IsBoolean()
  public icebreaker?: boolean;

  // Left out, the retro reviews the team's open actions.
  @IsOptional()
  @IsBoolean()
  public actionReview?: boolean;
}
