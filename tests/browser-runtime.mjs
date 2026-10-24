import {chromium as playwrightChromium} from 'playwright';
// CI uses Playwright's installed browser. Restricted developer environments can
// explicitly provide an existing Chromium binary without changing assertions.
export const chromium={launch(options={}){return playwrightChromium.launch({...options,...(process.env.LEXIGO_CHROMIUM_PATH?{executablePath:process.env.LEXIGO_CHROMIUM_PATH,args:[...(options.args||[]),'--no-sandbox','--disable-dev-shm-usage']}: {})})}};
