import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class GroupNoteDto {
  @IsString()
  @IsNotEmpty()
  public targetId!: string;
}

export class RenameClusterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public title!: string;
}
