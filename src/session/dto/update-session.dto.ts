import { IsString, IsNotEmpty, MinLength } from 'class-validator'

export class UpdateSessionDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'wallet_address must be at least 8 characters' })
  wallet_address: string
}
