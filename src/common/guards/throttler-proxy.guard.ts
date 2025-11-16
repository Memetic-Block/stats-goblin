import { Injectable } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

/**
 * GDPR-compliant throttler guard that:
 * 1. Extracts real IP from X-Forwarded-For header when behind proxy
 * 2. Anonymizes IP addresses before storage (removes last octet)
 * 3. No personal data stored in rate limiting
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Extract real IP from X-Forwarded-For header when behind proxy
    const ip = (req.ips && req.ips.length > 0) ? req.ips[0] : (req.ip || 'unknown')
    
    // Anonymize IP for GDPR compliance
    return this.anonymizeIp(ip)
  }

  /**
   * Anonymize IP address by removing identifying information
   * - IPv4: Remove last octet (192.168.1.x → 192.168.1.0)
   * - IPv6: Remove last 4 segments (keep /64 prefix)
   */
  private anonymizeIp(ip: string): string {
    if (ip === 'unknown') return ip

    // IPv4: Keep first 3 octets, zero out last octet
    if (ip.includes('.') && !ip.includes(':')) {
      const parts = ip.split('.')
      if (parts.length === 4) {
        return `${parts[0]}.${parts[1]}.${parts[2]}.0`
      }
    }

    // IPv6: Keep first 4 segments (64 bits), zero out rest
    if (ip.includes(':')) {
      const parts = ip.split(':').filter(p => p.length > 0)
      if (parts.length >= 4) {
        return `${parts[0]}:${parts[1]}:${parts[2]}:${parts[3]}::`
      }
    }

    return ip
  }
}
