import {IsNotEmpty, IsString} from 'class-validator';

export class GoogleLoginDto {
  @IsString()
  @IsNotEmpty()
  public idToken!: string;
}
