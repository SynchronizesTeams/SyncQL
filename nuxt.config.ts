// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  app: {
    head: {
      title: 'SyncQL — Collaborative Visual Database Designer',
      meta: [
        { name: 'description', content: 'SyncQL is a real-time collaborative database schema designer by SynchronizeTeams.' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ]
    }
  },
  nitro: {
    preset: 'bun',
    experimental: {
      websocket: true
    }
  },
  css: [
    '~/assets/css/app.css'
  ]
})

