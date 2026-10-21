import {IsNotEmpty, IsOptional, IsString, MaxLength} from 'class-validator';

export class CreateNoteDto {
  @IsString()
  @IsNotEmpty()
  public columnId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  public text!: string;
}

export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  public columnId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  public text?: string;
}
