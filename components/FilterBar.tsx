'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import {
  CATEGORIES_PRIMARY,
  CATEGORIES_EXTRA,
  CATEGORY_LABELS,
  COUNTRIES,
  COUNTRY_LABELS,
  COUNTRY_FLAGS,
} from '@/lib/types'
import type { Category, Country } from '@/lib/types'
import { EXTENDED_AFRICAN_COUNTRIES } from '@/lib/regions'

export default function FilterBar() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [topicsOpen, setTopicsOpen] = useState(false)
  const [africaOpen, setAfricaOpen] = useState(false)
  const topicsRef = useRef<HTMLDivElement>(null)
  const africaRef = useRef<HTMLDivElement>(null)

  const activeCategory = searchParams.get('category') as Category | null
  const activeCountry = searchParams.get('country')

  useEffect(() => {
    function closeOnOutside(ev: MouseEvent) {
      const t = ev.target as Node
      if (topicsRef.current && !topicsRef.current.contains(t)) setTopicsOpen(false)
      if (africaRef.current && !africaRef.current.contains(t)) setAfricaOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutside)
    return () => document.removeEventListener('mousedown', closeOnOutside)
  }, [])

  function navigate(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString())
    if (value === null || params.get(key) === value) {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  function isPrimaryCountryActive(c: Country) {
    return activeCountry === c
  }

  function isExtendedCountryActive(slug: string) {
    return activeCountry === slug
  }

  return (
    <div className="border-b sticky top-0 z-40 overflow-visible backdrop-blur-sm" style={{ borderColor: 'var(--rule)', background: 'rgba(250,247,240,0.95)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-visible">
        {/* Countries */}
        <div className="flex flex-wrap items-center gap-2 py-2 overflow-visible">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--ink-soft)' }}>Country</span>
          <div className="w-px h-4 shrink-0" style={{ background: 'var(--rule)' }} />
          {COUNTRIES.map((c) =>
            c === 'rest_of_africa' ? (
              <div key={c} className="relative shrink-0 overflow-visible" ref={africaRef}>
                <div
                  className="inline-flex items-stretch rounded-full border text-xs font-medium overflow-hidden"
                  style={
                    isPrimaryCountryActive(c) || (activeCountry && EXTENDED_AFRICAN_COUNTRIES.some((x) => x.slug === activeCountry))
                      ? { background: 'var(--forest)', color: 'white', borderColor: 'var(--forest)' }
                      : { background: 'transparent', color: 'var(--ink-mid)', borderColor: 'var(--rule)' }
                  }
                >
                  <button
                    type="button"
                    onClick={() => navigate('country', c)}
                    className="flex items-center gap-1 pl-3 pr-2 py-1 border-0 bg-transparent hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{ color: 'inherit' }}
                    aria-pressed={isPrimaryCountryActive(c)}
                  >
                    <span>{COUNTRY_FLAGS[c]}</span>
                    <span>{COUNTRY_LABELS[c]}</span>
                  </button>
                  <button
                    type="button"
                    aria-expanded={africaOpen}
                    aria-haspopup="menu"
                    aria-label="More African countries"
                    onClick={(e) => {
                      e.stopPropagation()
                      setAfricaOpen((o) => !o)
                      setTopicsOpen(false)
                    }}
                    className="flex items-center px-2 py-1 border-0 border-l bg-transparent hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{
                      color: 'inherit',
                      borderLeftColor:
                        isPrimaryCountryActive(c) || (activeCountry && EXTENDED_AFRICAN_COUNTRIES.some((x) => x.slug === activeCountry))
                          ? 'rgba(255,255,255,0.35)'
                          : 'var(--rule)',
                    }}
                  >
                    <ChevronDown size={14} className={africaOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
                  </button>
                </div>
                {africaOpen && (
                  <ul
                    role="menu"
                    className="absolute left-0 top-[calc(100%+4px)] z-[200] max-h-64 overflow-y-auto min-w-[220px] rounded-lg border py-1 shadow-xl text-left"
                    style={{ background: 'var(--parchment)', borderColor: 'var(--rule)' }}
                  >
                    {EXTENDED_AFRICAN_COUNTRIES.map(({ slug, label, emoji }) => (
                      <li key={slug} role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 hover:bg-black/5"
                          style={{ color: 'var(--ink-mid)' }}
                          onClick={() => {
                            navigate('country', slug)
                            setAfricaOpen(false)
                          }}
                        >
                          <span>{emoji}</span>
                          <span className={isExtendedCountryActive(slug) ? 'font-semibold' : ''}>{label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <button
                key={c}
                type="button"
                onClick={() => navigate('country', c)}
                className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2"
                style={
                  activeCountry === c
                    ? { background: 'var(--forest)', color: 'white', borderColor: 'var(--forest)' }
                    : { background: 'transparent', color: 'var(--ink-mid)', borderColor: 'var(--rule)' }
                }
                aria-pressed={activeCountry === c}
              >
                <span>{COUNTRY_FLAGS[c]}</span>
                <span>{COUNTRY_LABELS[c]}</span>
              </button>
            )
          )}
        </div>

        <hr className="rule-single" />

        {/* Categories */}
        <div className="flex flex-wrap items-center gap-2 py-2 overflow-visible">
          <span className="text-xs font-medium shrink-0" style={{ color: 'var(--ink-soft)' }}>Topic</span>
          <div className="w-px h-4 shrink-0" style={{ background: 'var(--rule)' }} />
          {CATEGORIES_PRIMARY.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => navigate('category', cat)}
              className="shrink-0 px-3 py-1 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2"
              style={
                activeCategory === cat
                  ? { background: 'var(--amber)', color: 'white', borderColor: 'var(--amber)' }
                  : { background: 'transparent', color: 'var(--ink-mid)', borderColor: 'var(--rule)' }
              }
              aria-pressed={activeCategory === cat}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
          <div className="relative shrink-0 overflow-visible" ref={topicsRef}>
            <button
              type="button"
              aria-expanded={topicsOpen}
              aria-haspopup="menu"
              onClick={() => {
                setTopicsOpen((o) => !o)
                setAfricaOpen(false)
              }}
              className="shrink-0 flex items-center gap-1 pl-3 pr-2 py-1 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2"
              style={
                activeCategory && CATEGORIES_EXTRA.includes(activeCategory)
                  ? { background: 'var(--amber)', color: 'white', borderColor: 'var(--amber)' }
                  : { background: 'transparent', color: 'var(--ink-mid)', borderColor: 'var(--rule)' }
              }
            >
              <span>More topics</span>
              <ChevronDown size={14} className={topicsOpen ? 'rotate-180 transition-transform' : 'transition-transform'} />
            </button>
            {topicsOpen && (
              <ul
                role="menu"
                className="absolute right-0 top-[calc(100%+4px)] z-[200] min-w-[220px] rounded-lg border py-1 shadow-xl text-left"
                style={{ background: 'var(--parchment)', borderColor: 'var(--rule)' }}
              >
                {CATEGORIES_EXTRA.map((cat) => (
                  <li key={cat} role="none">
                    <button
                      type="button"
                      role="menuitem"
                      className="w-full text-left px-3 py-2 text-xs hover:bg-black/5"
                      style={{ color: 'var(--ink-mid)' }}
                      onClick={() => {
                        navigate('category', cat)
                        setTopicsOpen(false)
                      }}
                    >
                      {CATEGORY_LABELS[cat]}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
