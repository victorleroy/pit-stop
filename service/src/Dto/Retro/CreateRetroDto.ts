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

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  public maxVotes?: number;
}
