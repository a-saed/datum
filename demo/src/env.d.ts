/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATUM_SERVER_URL?: string
  readonly VITE_DATUM_AUTH_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
