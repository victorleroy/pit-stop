import {Transform} from 'class-transformer';
import {IsNotEmpty, IsString, MaxLength} from 'class-validator';

export class AddTeamMemberDto {
  @IsString()
  @IsNotEmpty()
  public userId!: string;
}

export class CreateTeamDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name!: string;
}

export class RenameTeamDto {
  // Trimmed before validation, so a name of blanks is refused as empty.
  @Transform(({value}) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  public name!: string;
}
