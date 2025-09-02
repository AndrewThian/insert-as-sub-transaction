declare global {
  namespace NodeJS {
    interface ProcessEnv {
      YNAB_ACCESS_TOKEN: string | undefined;
    }
  }
}

export {};