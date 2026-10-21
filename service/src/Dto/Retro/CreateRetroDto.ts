import {ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';

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
}
