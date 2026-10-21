import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class CreateColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  public title!: string;
}

export class RenameColumnDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  public title!: string;
}
