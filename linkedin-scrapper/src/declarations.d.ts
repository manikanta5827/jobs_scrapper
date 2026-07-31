declare module 'random-useragent' {
  export function getRandom(filter?: (ua: any) => boolean): string;
}

declare module 'puppeteer-extra' {
  import puppeteer from 'puppeteer-core';
  export = puppeteer;
}

declare module 'puppeteer-extra-plugin-stealth' {
  function StealthPlugin(): any;
  export = StealthPlugin;
}

declare module '@sparticuz/chromium' {
  export const args: string[];
  export const defaultViewport: { width: number; height: number };
  export const headless: boolean;
  export function executablePath(): Promise<string>;
}
