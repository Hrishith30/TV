/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_IPTV_SERVER?: string;
  readonly VITE_IPTV_USER?: string;
  readonly VITE_IPTV_PASS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
