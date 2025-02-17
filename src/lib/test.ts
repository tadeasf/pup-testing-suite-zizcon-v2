import puppeteer, { Page, Browser } from 'puppeteer';
import {
  FlowConfig,
  SignInFlow,
  BlogFlow,
  GalleryFlow,
  HomepageFlow,
  ProfileFlow,
  PravidlaFlow,
  Flow
} from '../flows';

// Configuration
const config: FlowConfig & {
  auth0Domain: string;
  userDataDir: string;
  credentials: {
    email: string;
    password: string;
  };
} = {
  baseUrl: 'https://dev.next.zizcon.cz',
  auth0Domain: 'dev-zhcom0xk8ta0ma1c.us.auth0.com',
  userDataDir: './user-data-test',
  credentials: {
    email: 'puppeteer1@bench.com',
    password: 'Argonek.007'
  },
  minWaitMs: 50,   // Minimum wait between actions
  maxWaitMs: 900,  // Maximum wait between actions
  stepTimeout: 2000, // Timeout for each step
  retryAttempts: 3  // Number of retry attempts per step
};

// Browser Setup
async function setupBrowser(): Promise<Browser> {
  const proxyUrl = 'socks5://127.0.0.1:9050';
  
  console.log('Setting up browser with proxy:', proxyUrl);
  return await puppeteer.launch({
    headless: true,
    executablePath: './chrome/linux-133.0.6943.98/chrome-linux64/chrome',
    args: [
      `--proxy-server=${proxyUrl}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--ignore-certificate-errors',
      '--disable-gpu',
      '--window-size=1265,1277',
      '--disable-dev-shm-usage',
      '--disable-software-rasterizer'
    ],
    userDataDir: config.userDataDir,
    timeout: 120000,
    defaultViewport: {
      width: 1265,
      height: 1277,
      deviceScaleFactor: 1
    }
  });
}

// Flow Selection
function getRandomFlow(): Flow {
  const flows: Flow[] = [
    new ProfileFlow(),
    new HomepageFlow(),
    new BlogFlow(),
    new GalleryFlow(),
    new PravidlaFlow()
  ];
  return flows[Math.floor(Math.random() * flows.length)];
}

// Main Test Runner
async function runTests() {
  let browser: Browser | null = null;
  let page: Page | null = null;
  
  try {
    browser = await setupBrowser();
    page = await browser.newPage();
    
    // Setup page configuration
    await page.setViewport({ width: 1265, height: 1277 });
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);
    
    // Setup logging
    page.on('console', msg => {
      const text = msg.text();
      if (!text.includes('cookie') && !text.includes('Permissions-Policy')) {
        console.log('Browser Console:', text);
      }
    });
    
    page.on('error', err => console.error('Browser Error:', err));
    
    // Log Auth0-related requests/responses
    page.on('request', req => {
      const url = req.url();
      if (url.includes(config.auth0Domain)) {
        console.log('Auth0 Request:', url);
      }
    });
    
    page.on('response', res => {
      const url = res.url();
      if (url.includes(config.auth0Domain)) {
        console.log('Auth0 Response:', url, res.status());
      }
    });
    
    // Initialize flows
    const signInFlow = new SignInFlow(config.credentials, config.auth0Domain);
    
    // First handle login
    const loginResult = await signInFlow.execute(page, config, 0); // Use 0 as test user ID
    if (!loginResult.success) {
      throw new Error('Login failed');
    }
    
    // After login, start random flow execution
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    
    while (consecutiveFailures < maxConsecutiveFailures) {
      const flow = getRandomFlow();
      console.log(`Attempting ${flow.name} flow (failure count: ${consecutiveFailures})`);
      
      const result = await flow.execute(page, config, 0); // Use 0 as test user ID
      
      if (result.success) {
        console.log(`Successfully executed ${flow.name} flow`);
        consecutiveFailures = 0; // Reset failure counter on any success
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1s between flows
      } else {
        console.log(`Failed to execute ${flow.name} flow:`, result.error);
        consecutiveFailures++;
        
        if (consecutiveFailures >= maxConsecutiveFailures) {
          console.log('Maximum consecutive failures reached, waiting 2s before trying a new flow...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          // Try one more flow after the timeout
          const recoveryFlow = getRandomFlow();
          const recoveryResult = await recoveryFlow.execute(page, config, 0);
          
          if (recoveryResult.success) {
            console.log('Recovery flow succeeded, resetting failure counter');
            consecutiveFailures = 0;
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            throw new Error(`Failed ${maxConsecutiveFailures} flows in a row and recovery attempt failed`);
          }
        }
      }
    }
    
    console.log('Test execution completed');
    
    // Keep browser open for inspection
    console.log('Browser will stay open for inspection. Press Ctrl+C to exit.');
    await new Promise(() => {});
    
  } catch (error) {
    console.error('Test execution failed:', error);
    if (browser) {
      await browser.close();
    }
  }
}

// Run the tests
runTests().catch(console.error);
