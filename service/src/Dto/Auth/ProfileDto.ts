import {Type} from 'class-transformer';
import {Equals, IsIn, IsOptional, IsString, ValidateNested} from 'class-validator';

export class AvatarChoiceDto {
  // An upload only ever goes through PUT /me/avatar, with the image itself.
  @IsIn(['auto', 'initials'])
  public source!: 'auto' | 'initials';
}

/** The name is normalised then bounded by ProfileManager: the limit applies to what shows. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  public name?: string;

  @IsOptional()
  @Equals(true)
  public useSsoName?: true;

  @IsOptional()
  @ValidateNested()
  @Type(() => AvatarChoiceDto)
  public avatar?: AvatarChoiceDto;
}
