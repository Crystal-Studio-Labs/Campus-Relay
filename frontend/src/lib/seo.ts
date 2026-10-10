/** Page-by-page SEO, Open Graph and Twitter Card manager.
 *
 *  Ensures search engines, preview crawlers (WhatsApp, Discord, Twitter, LinkedIn),
 *  and browser tab title bars reflect the current screen's exact context.
 */

import { useEffect } from 'react'

export interface PageMetaOptions {
  title?: string
  subtitle?: string
  description?: string
  ogType?: 'website' | 'article' | 'profile'
  image?: string
  canonicalUrl?: string
}

export function setPageMeta({
  title,
  subtitle,
  description,
  ogType = 'website',
  image = '/social-preview.png',
  canonicalUrl,
}: PageMetaOptions) {
  // 1. Browser Tab Title
  const cleanTitle = title ? `${title} · Campus Relay` : 'Campus Relay — Resilient Campus Operations Platform'
  document.title = cleanTitle

  // 2. Meta Description
  const metaDesc = description || subtitle || 'A resilient operating layer for everyday campus operations: universal case engine, cryptographic gate passes, offline sync, and auditable trails.'

  // 3. Resolve absolute image URL for preview crawlers (WhatsApp, Telegram, Twitter, LinkedIn)
  const baseOrigin = typeof window !== 'undefined' && window.location.origin ? window.location.origin : 'https://campusrelay.org'
  const absoluteImage = image.startsWith('http')
    ? image
    : `${baseOrigin}${image.startsWith('/') ? image : `/${image}`}`

  const updateMeta = (key: string, value: string, attr: 'name' | 'property' = 'name') => {
    let el = document.querySelector(`meta[${attr}="${key}"]`)
    if (!el) {
      el = document.createElement('meta')
      el.setAttribute(attr, key)
      document.head.appendChild(el)
    }
    el.setAttribute('content', value)
  }

  updateMeta('description', metaDesc)
  updateMeta('og:title', cleanTitle, 'property')
  updateMeta('og:description', metaDesc, 'property')
  updateMeta('og:type', ogType, 'property')
  updateMeta('og:image', absoluteImage, 'property')
  updateMeta('og:image:secure_url', absoluteImage, 'property')
  updateMeta('og:image:alt', 'Campus Relay — A Resilient Operating Layer for Everyday Campus Operations', 'property')
  updateMeta('twitter:card', 'summary_large_image')
  updateMeta('twitter:title', cleanTitle)
  updateMeta('twitter:description', metaDesc)
  updateMeta('twitter:image', absoluteImage)
  updateMeta('twitter:image:alt', 'Campus Relay — A Resilient Operating Layer for Everyday Campus Operations')

  // 4. Canonical Link + og:url + twitter:url (kept in step, so a shared deep link previews
  // the screen it actually points at rather than the home page).
  const href = canonicalUrl || (typeof window !== 'undefined' ? window.location.href : 'https://campusrelay.org/')
  let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.href = href
  updateMeta('og:url', href, 'property')
  updateMeta('twitter:url', href)
}

/** React hook that synchronizes page title and SEO meta graphs upon mount/update */
export function usePageMeta(options: PageMetaOptions) {
  useEffect(() => {
    setPageMeta(options)
  }, [options.title, options.subtitle, options.description, options.ogType, options.image, options.canonicalUrl])
}
