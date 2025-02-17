import puppeteer, { Page, Frame } from 'puppeteer';
import * as ProxyChain from 'proxy-chain';
import {
  FlowConfig,
  SignInFlow,
  BlogFlow,
  GalleryFlow,
  HomepageFlow,
  ProfileFlow,
  PravidlaFlow,
  LogoutFlow,
  Flow,
  getRandomDelay,
  WaitUntilOption
} from './flows';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
const execAsync = promisify(exec);

interface MultiInstanceConfig extends FlowConfig {
  concurrentUsers: number;
  userDataDirs: string[];
  proxies: {
    local: { ports: number[]; description: string; };
    remote: { urls: string[]; description: string; };
  };
  credentials: Array<{
    email: string;
    password: string;
  }>;
  auth0Domain: string;
  requireAuth?: boolean;
  proxyMode: 'local' | 'remote';
  sessionTimestamp?: string;
}

// Configuration
const config: MultiInstanceConfig = {
  concurrentUsers: 2, // Will be set based on proxy mode
  baseUrl: 'https://dev.next.zizcon.cz',
  auth0Domain: 'dev-zhcom0xk8ta0ma1c.us.auth0.com',
  minWaitMs: 10,
  maxWaitMs: 100,
  stepTimeout: 250,
  retryAttempts: 2,
  requireAuth: false,
  proxyMode: 'local', // Will be set by command line args
  navigationOptions: {
    waitUntil: ['networkidle0', 'domcontentloaded'] as WaitUntilOption[],
    timeout: 120000
  },
  userDataDirs: [], // Will be populated based on concurrentUsers
  proxies: {
    local: {
      ports: Array.from({ length: 10 }, (_, i) => 9050 + i), // 9050 to 9059
      description: 'Local Tor Proxies'
    },
    remote: {
      urls: [
        'http://185.187.169.230:6969',
        'http://194.5.152.243:6969'
      ],
      description: 'Remote Squid->Tor Proxies'
    }
  },
  credentials: [
    { email: 'puppeteer1@bench.com', password: 'Argonek.007' },
    { email: 'puppeteer2@bench.com', password: 'Argonek.007' },
    { email: 'puppeteer3@bench.com', password: 'Argonek.007' }
  ]
};

// Random user agents to make each session look unique
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36 Edg/91.0.864.59'
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getProxyForUser(userId: number, config: MultiInstanceConfig): string {
  if (config.proxyMode === 'local') {
    const port = config.proxies.local.ports[userId % config.proxies.local.ports.length];
    return `socks5://127.0.0.1:${port}`;
  } else {
    return config.proxies.remote.urls[userId % config.proxies.remote.urls.length];
  }
}

// Flow Selection - Update to exclude Profile flow if not authenticated
function getRandomFlow(requireAuth: boolean): Flow {
  const flows: Flow[] = [
    new HomepageFlow(),
    new BlogFlow(),
    new GalleryFlow(),
    new PravidlaFlow()
  ];
  
  // Only include Profile flow if authentication is required
  if (requireAuth) {
    flows.push(new ProfileFlow());
  }
  
  return flows[Math.floor(Math.random() * flows.length)];
}

async function runUserSession(userId: number) {
  let browser = null;
  let proxyServer = null;
  let page: Page | null = null;
  const screenshotBaseDir = path.join(process.cwd(), 'screenshots', `user-${userId}`, config.sessionTimestamp || '');
  // Track navigation chain
  const redirectChain: string[] = [];

  try {
    await fs.mkdir(screenshotBaseDir, { recursive: true });

    const userDataDir = path.join(process.cwd(), 'user-data', `user-${userId}`);
    await fs.mkdir(userDataDir, { recursive: true });

    // Get proxy for this user
    const proxyUrl = getProxyForUser(userId, config);
    const credentials = config.credentials[userId % config.credentials.length];

    // Anonymize HTTP proxies if using remote mode
    if (config.proxyMode === 'remote') {
      proxyServer = await ProxyChain.anonymizeProxy(proxyUrl);
    }

    // Launch browser with proxy and additional flags
    console.log(`User ${userId}: Launching browser with proxy ${proxyServer || proxyUrl}`);
    browser = await puppeteer.launch({
      headless: true,
      executablePath: './chrome/linux-133.0.6943.98/chrome-linux64/chrome',
      args: [
        `--proxy-server=${proxyServer || proxyUrl}`,
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--ignore-certificate-errors',
        '--disable-gpu',
        '--window-size=1265,1277',
        '--disable-dev-shm-usage',
        '--disable-software-rasterizer',
        '--disable-features=IsolateOrigins,site-per-process', // Disable site isolation
        '--disable-web-security', // Allow cross-origin iframes
        '--disable-features=BlockInsecurePrivateNetworkRequests' // Allow mixed content
      ],
      userDataDir,
      timeout: 120000,
      defaultViewport: {
        width: 1265,
        height: 1277,
        deviceScaleFactor: 1
      }
    });

    console.log(`User ${userId}: Browser launched successfully`);
    page = await browser.newPage();
    
    // Set unique user agent
    const userAgent = getRandomUserAgent();
    await page.setUserAgent(userAgent);
    
    // Set viewport and timeouts
    await page.setViewport({ width: 1265, height: 1277 });
    page.setDefaultTimeout(120000);
    page.setDefaultNavigationTimeout(120000);

    // Enable request interception for better control
    await page.setRequestInterception(true);
    
    // Handle requests
    page.on('request', async request => {
      const url = request.url();
      
      // Modify headers for all requests
      const headers: Record<string, string> = {
        ...request.headers(),
        'Accept-Language': 'en-US,en;q=0.9',
        'DNT': '1',
        'Upgrade-Insecure-Requests': '1'
      };

      // Special handling for Auth0 requests
      if (url.includes(config.auth0Domain)) {
        headers['Origin'] = `https://${config.auth0Domain}`;
        headers['Referer'] = `https://${config.auth0Domain}/`;
      }

      try {
        await request.continue({ headers });
      } catch (error) {
        console.error(`User ${userId}: Request continuation failed:`, error);
        request.abort();
      }
    });

    // Set up navigation tracking
    const navigationListener = (frame: Frame) => {
      if (frame === page?.mainFrame()) {
        const url = frame.url();
        console.log(`User ${userId}: Navigation to:`, url);
        redirectChain.push(url);
      }
    };
    page.on('framenavigated', navigationListener);

    // Only perform login if authentication is required
    if (config.requireAuth === true) {
      console.log(`User ${userId}: Starting authentication flow...`);
      
      // Clear all cookies before starting auth using browser context
      const context = page.browserContext();
      const cookies = await context.cookies();
      await Promise.all(cookies.map(cookie => context.deleteCookie(cookie)));
      
      const signInFlow = new SignInFlow(credentials, config.auth0Domain);
      const loginResult = await signInFlow.execute(page, config, userId);
      
      if (!loginResult.success) {
        throw new Error(`Login failed: ${loginResult.details}`);
      }
      
      // Take a screenshot after successful login
      const loginSuccessPath = path.join(
        screenshotBaseDir,
        'login-success',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-login-verified.png`
      );
      await fs.mkdir(path.dirname(loginSuccessPath), { recursive: true });
      await page.screenshot({ path: loginSuccessPath, fullPage: true });
      
      console.log(`User ${userId}: Authentication successful`);
    }

    // Execute random flows with session timestamp in config
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;
    
    while (consecutiveFailures < maxConsecutiveFailures) {
      const flow = getRandomFlow(config.requireAuth === true);
      console.log(`User ${userId}: Attempting ${flow.name} flow (failure count: ${consecutiveFailures})`);
      
      const result = await flow.execute(page, config, userId);
      
      if (result.success) {
        console.log(`User ${userId}: Successfully executed ${flow.name} flow`);
        consecutiveFailures = 0;
        await new Promise(resolve => setTimeout(resolve, getRandomDelay(config.minWaitMs, config.maxWaitMs)));
      } else {
        consecutiveFailures++;
        // Take error screenshot
        const errorPath = path.join(
          screenshotBaseDir,
          'errors',
          `${new Date().toISOString().replace(/[:.]/g, '-')}-${flow.name}-error.png`
        );
        await fs.mkdir(path.dirname(errorPath), { recursive: true });
        await page.screenshot({ path: errorPath, fullPage: true });
        
        if (consecutiveFailures >= maxConsecutiveFailures) {
          throw new Error(`Failed ${maxConsecutiveFailures} flows in a row`);
        }
      }
    }

    // Perform logout if we're authenticated
    if (config.requireAuth === true) {
      const logoutFlow = new LogoutFlow();
      await logoutFlow.execute(page, config, userId);
      // Clean up session data after logout
      const sessionDir = path.join(process.cwd(), 'sessions', `user-${userId}`);
      await fs.rm(sessionDir, { recursive: true, force: true });
    }

    console.log(`User ${userId}: Session completed successfully`);
  } catch (error) {
    console.error(`User ${userId}: Session error:`, error);
    // Take final error screenshot in session directory
    try {
      const finalErrorPath = path.join(
        screenshotBaseDir,
        'errors',
        `${new Date().toISOString().replace(/[:.]/g, '-')}-final-error.png`
      );
      await fs.mkdir(path.dirname(finalErrorPath), { recursive: true });
      if (browser && page) {
        await page.screenshot({ path: finalErrorPath, fullPage: true });
      }
    } catch (screenshotError) {
      console.error(`User ${userId}: Failed to take final error screenshot:`, screenshotError);
    }
  } finally {
    // Clean up event listeners
    if (page) {
      page.removeAllListeners('framenavigated');
    }
    if (browser) await browser.close();
    if (proxyServer) await ProxyChain.closeAnonymizedProxy(proxyServer, true);
  }
}

async function cleanupFirefoxProfiles() {
  try {
    // Kill any hanging Firefox processes
    await execAsync('pkill firefox; pkill -f firefox').catch(() => {});
    
    // Remove temporary Firefox profiles
    await execAsync('rm -rf ~/.mozilla/firefox/Puppeteer*').catch(() => {});
    
    // console.log('Cleaned up Firefox profiles');
  } catch (error) {
    console.error('Error cleaning up Firefox profiles:', error);
  }
}

async function cleanupUserData() {
  try {
    // Remove all user data directories
    await execAsync('rm -rf ./user-data-*').catch(() => {});
    console.log('Cleaned up user data directories');
  } catch (error) {
    console.error('Error cleaning up user data:', error);
  }
}

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  config.requireAuth = args.includes('--signin');
  const shouldCleanupUserData = args.includes('--no-cookies');
  
  // Set proxy mode and concurrent users
  if (args.includes('--local')) {
    config.proxyMode = 'local';
    config.concurrentUsers = config.proxies.local.ports.length; // Use all available Tor proxies
  } else if (args.includes('--remote')) {
    config.proxyMode = 'remote';
    config.concurrentUsers = config.proxies.remote.urls.length; // Use available remote proxies
  } else {
    console.error('Please specify proxy mode: --local or --remote');
    process.exit(1);
  }

  // Create session timestamp for this run
  const sessionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
  config.sessionTimestamp = sessionTimestamp;
  console.log(`Starting session: ${sessionTimestamp}`);

  // Update user data directories based on concurrent users
  config.userDataDirs = Array.from(
    { length: config.concurrentUsers },
    (_, i) => path.join(process.cwd(), 'user-data', `user-${i}`)
  );

  try {
    // Clean up before starting if --no-cookies is specified
    if (shouldCleanupUserData) {
      await cleanupUserData();
      await cleanupFirefoxProfiles();
    }

    console.log(`Starting load test... (Auth: ${config.requireAuth ? 'enabled' : 'disabled'}, Proxy: ${config.proxyMode}, Users: ${config.concurrentUsers})`);
    const sessions = [];

    // Launch concurrent user sessions
    for (let i = 0; i < config.concurrentUsers; i++) {
      sessions.push(runUserSession(i));
      // Add small delay between launching sessions
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for all sessions to complete
    await Promise.all(sessions);
    console.log('Load test completed.');
  } finally {
    // Clean up after completion
    await cleanupFirefoxProfiles();
  }
}

main().catch(console.error);