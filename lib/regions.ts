import type { Country } from '@/lib/types'
import { COUNTRY_FLAGS, COUNTRY_LABELS } from '@/lib/types'

export const PRIMARY_COUNTRY_SLUGS = [
  'nigeria',
  'kenya',
  'south_africa',
  'egypt',
  'ghana',
  'morocco',
  'rest_of_africa',
] as const

export const EXTENDED_AFRICAN_COUNTRIES: { slug: string; label: string; emoji: string }[] = [
  { slug: 'ethiopia', label: 'Ethiopia', emoji: '🇪🇹' },
  { slug: 'tanzania', label: 'Tanzania', emoji: '🇹🇿' },
  { slug: 'uganda', label: 'Uganda', emoji: '🇺🇬' },
  { slug: 'rwanda', label: 'Rwanda', emoji: '🇷🇼' },
  { slug: 'senegal', label: 'Senegal', emoji: '🇸🇳' },
  { slug: 'cote_d_ivoire', label: "Cote d'Ivoire", emoji: '🇨🇮' },
  { slug: 'cameroon', label: 'Cameroon', emoji: '🇨🇲' },
  { slug: 'tunisia', label: 'Tunisia', emoji: '🇹🇳' },
  { slug: 'algeria', label: 'Algeria', emoji: '🇩🇿' },
  { slug: 'zambia', label: 'Zambia', emoji: '🇿🇲' },
  { slug: 'zimbabwe', label: 'Zimbabwe', emoji: '🇿🇼' },
  { slug: 'botswana', label: 'Botswana', emoji: '🇧🇼' },
  { slug: 'namibia', label: 'Namibia', emoji: '🇳🇦' },
  { slug: 'mozambique', label: 'Mozambique', emoji: '🇲🇿' },
  { slug: 'angola', label: 'Angola', emoji: '🇦🇴' },
  { slug: 'drc', label: 'DR Congo', emoji: '🇨🇩' },
  { slug: 'mauritius', label: 'Mauritius', emoji: '🇲🇺' },
]

const EXTENDED_SET = new Set(EXTENDED_AFRICAN_COUNTRIES.map((c) => c.slug))

export function isValidCountryFilter(slug: string | undefined | null): boolean {
  if (!slug) return true
  if ((PRIMARY_COUNTRY_SLUGS as readonly string[]).includes(slug)) return true
  return EXTENDED_SET.has(slug)
}

export const LLM_COUNTRY_TAG_HINTS = [
  ...PRIMARY_COUNTRY_SLUGS.filter((s) => s !== 'rest_of_africa'),
  ...EXTENDED_AFRICAN_COUNTRIES.map((c) => c.slug),
  'rest_of_africa',
].join(', ')

export function flagAndLabelForCountryTag(slug: string): { emoji: string; label: string } | null {
  if ((PRIMARY_COUNTRY_SLUGS as readonly string[]).includes(slug)) {
    const c = slug as Country
    return { emoji: COUNTRY_FLAGS[c], label: COUNTRY_LABELS[c] }
  }
  const ext = EXTENDED_AFRICAN_COUNTRIES.find((c) => c.slug === slug)
  if (ext) return { emoji: ext.emoji, label: ext.label }
  return null
}
