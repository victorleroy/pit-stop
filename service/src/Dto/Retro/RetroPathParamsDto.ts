import {IsNotEmpty, IsString} from 'class-validator';

export class RetroPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public retroId!: string;
}

export class ColumnPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public columnId!: string;

  @IsString()
  @IsNotEmpty()
  public retroId!: string;
}

export class NotePathParamsDto {
  @IsString()
  @IsNotEmpty()
  public noteId!: string;

  @IsString()
  @IsNotEmpty()
  public retroId!: string;
}

export class ClusterPathParamsDto {
  @IsString()
  @IsNotEmpty()
  public clusterId!: string;

  @IsString()
  @IsNotEmpty()
  public retroId!: string;
}
