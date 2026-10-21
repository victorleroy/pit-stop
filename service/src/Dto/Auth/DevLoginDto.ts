import {IsOptional, IsString, MaxLength} from 'class-validator';
import {IsPlainEmail} from '~/Dto/IsPlainEmail';

export class DevLoginDto {
  @IsPlainEmail()
  public email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  public name?: string;
}
