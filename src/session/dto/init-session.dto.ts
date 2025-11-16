import { IsString, IsNotEmpty, Matches, Length } from 'class-validator'

export class InitSessionDto {
  @IsString()
  @IsNotEmpty()
  @Length(2, 50)
  @Matches(/^[a-zA-Z0-9-]+$/, {
    message: 'client_name must contain only alphanumeric characters and hyphens'
  })
  client_name: string

  @IsString()
  @IsNotEmpty()
  @Length(1, 20)
  @Matches(/^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/, {
    message: 'client_version must be in semver format (e.g., 1.2.3 or 1.2.3-beta.1)'
  })
  client_version: string
}
