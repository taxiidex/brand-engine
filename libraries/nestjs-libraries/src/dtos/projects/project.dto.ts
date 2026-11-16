import { IsDefined, IsString, MaxLength, MinLength } from 'class-validator';

export class ProjectNameDto {
  @IsString()
  @IsDefined()
  @MinLength(2)
  @MaxLength(100)
  name: string;
}
