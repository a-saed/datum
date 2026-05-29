import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Datum',
  description: 'Local-first spatial sync for PostGIS.',
  base: '/datum/',
  srcExclude: ['**/superpowers/**'],
  ignoreDeadLinks: [/localhost/],
  head: [['link', { rel: 'icon', href: '/logo.svg', type: 'image/svg+xml' }]],
  themeConfig: {
    logo: '/logo.svg',
    nav: [
      { text: 'Guide', link: '/getting-started' },
      { text: 'API', link: '/api' },
      { text: 'GitHub', link: 'https://github.com/a-saed/datum' },
    ],
    sidebar: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'How It Works', link: '/how-it-works' },
      { text: 'API Reference', link: '/api' },
      { text: 'Authentication', link: '/auth' },
      { text: 'Self-Hosting', link: '/self-hosting' },
    ],
    socialLinks: [
      { icon: 'github', link: 'https://github.com/a-saed/datum' },
    ],
    footer: {
      message: 'Released under the MIT License.',
    },
  },
})
