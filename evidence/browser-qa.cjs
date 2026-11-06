/* Reproducible, sandbox-enabled local browser QA entry point.
 * Start server separately:
 * npm run dev --workspace app -- --host 127.0.0.1 --port 4173 --strictPort
 * Run: node evidence/browser-qa.cjs
 * Never removes Chromium's sandbox or changes application source.
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.QA_PLAYWRIGHT || '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/node/lib/node_modules/@askjo/camofox-browser/node_modules/playwright-core');
const evidence = __dirname;
const browsers = process.env.QA_BROWSER ? [process.env.QA_BROWSER] : [
  '/root/.hermes/tools/chromium-1208/chrome-linux64/chrome',
  '/root/.hermes-web-ui/desktop-runtime/hermes/0.22.2/linux-x64/python/agent-browser/browsers/chrome-149.0.7827.55/chrome'
];
const result = {status:'not-run', attempts:[], checks:[], screenshots:[]};
async function main() {
  let browser;
  for (const executablePath of browsers) {
    try {
      browser = await chromium.launch({executablePath, headless:true, chromiumSandbox:true,
        env:{...process.env, LD_LIBRARY_PATH: '/root/.hermes/cache/scratch/sidequest-browser-runtime/runtime/usr/lib/x86_64-linux-gnu'}, timeout:30000});
      result.attempts.push({executablePath, launched:true});
      break;
    } catch (error) {
      result.attempts.push({executablePath, launched:false, error:String(error)});
    }
  }
  if (!browser) { result.status='blocked-before-navigation'; return; }
  try {
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    const errors = [];
    const responses = [];
    const failedResources = [];
    result.errors=errors;result.responses=responses;result.failedResources=failedResources;
    page.on('pageerror', e => errors.push({type:'pageerror', text:String(e), stack:e.stack || null}));
    page.on('console', m => {if(m.type()==='error') errors.push({type:'console', text:m.text(), location:m.location()});});
    page.on('response', r => {
      const response = {url:r.url(), status:r.status(), resourceType:r.request().resourceType()};
      if(r.url().endsWith('.glb')) responses.push(response);
      if(r.status() >= 400) failedResources.push(response);
    });
    page.on('requestfailed', r => failedResources.push({url:r.url(), resourceType:r.resourceType(), failure:r.failure()}));
    await page.goto('http://127.0.0.1:4173/', {waitUntil:'networkidle'});
    await page.locator('canvas').waitFor();
    await page.waitForTimeout(3000);
    fs.mkdirSync(path.join(evidence,'browser-screenshots'),{recursive:true});
    const save = async name => {const p=path.join(evidence,'browser-screenshots',name+'.png'); await page.screenshot({path:p,fullPage:true});result.screenshots.push(p);};
    await save('open');
    const closed = page.getByRole('button',{name:'CLOSED · 210°',exact:true});
    const open = page.getByRole('button',{name:'OPEN · 120°',exact:true});
    await closed.click();
    result.checks.push({check:'closed-click',ariaPressed:await closed.getAttribute('aria-pressed')});
    await save('closed');
    await open.focus(); await page.keyboard.press('Enter');
    result.checks.push({check:'open-enter',ariaPressed:await open.getAttribute('aria-pressed')});
    await closed.focus(); await page.keyboard.press('Space');
    result.checks.push({check:'closed-space',ariaPressed:await closed.getAttribute('aria-pressed')});
    result.status=(errors.length || failedResources.length) ? 'failed' : 'passed';
  } finally {await browser.close();}
}
main().catch(e=>{result.status='error';result.error=String(e);process.exitCode=1;}).finally(()=>{
 fs.writeFileSync(path.join(evidence,'browser-qa-results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result,null,2));
 if(result.status==='blocked-before-navigation')process.exitCode=2;
 if(result.status==='failed' || result.status==='error')process.exitCode=1;
});
