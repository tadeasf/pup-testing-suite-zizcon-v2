import { Page } from 'puppeteer';
import { FlowConfig, FlowResult } from './types';
import { BaseFlow } from './base';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { useAuthStore } from '../stores/authStore';
import { syncAuth } from '../utils/authSync';

interface Auth0Credentials {
  email: string;
  password: string;
}

export class SignInFlow extends BaseFlow {
  name = 'signin';
  private credentials: Auth0Credentials;
  private auth0Domain: string;

  constructor(credentials: Auth0Credentials, auth0Domain: string) {
    super();
    this.credentials = credentials;
    this.auth0Domain = auth0Domain;
  }

  getSteps() {
    return []; // We'll handle the flow directly in execute()
  }

  private generateStateAndNonce() {
    return {
      state: crypto.randomBytes(32).toString('hex'),
      nonce: crypto.randomBytes(32).toString('hex')
    };
  }

  private async waitForAuthCallback(page: Page, config: FlowConfig, userId: number): Promise<boolean> {
    const maxAttempts = 3;
    const timeout = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
          const currentUrl = page.url();
          
          // If we're back at the base URL, auth was successful
          if (currentUrl.startsWith(config.baseUrl) && !currentUrl.includes('/auth/callback')) {
            console.log(`User ${userId}: Successfully authenticated and redirected`);
            return true;
          }
          
          // If we're still on the callback URL, wait
          if (currentUrl.includes('/auth/callback')) {
            console.log(`User ${userId}: Still on callback URL, waiting...`);
            await new Promise(resolve => setTimeout(resolve, checkInterval));
            continue;
          }
          
          // If we're on an error page or unexpected URL, break this attempt
          if (currentUrl.includes('error') || !currentUrl.includes(this.auth0Domain)) {
            console.log(`User ${userId}: Unexpected URL during auth: ${currentUrl}`);
            break;
          }
        }
        
        console.log(`User ${userId}: Auth attempt ${attempt} timed out, retrying...`);
        
        // Clear cookies and storage before retrying
        const context = page.browserContext();
        const cookies = await context.cookies();
        await Promise.all(cookies.map(cookie => context.deleteCookie(cookie)));
        await page.evaluate(() => {
          window.sessionStorage.clear();
          window.localStorage.clear();
        });
        
      } catch (error) {
        console.error(`User ${userId}: Error during auth attempt ${attempt}:`, error);
      }
    }

    return false;
  }

  async execute(page: Page, config: FlowConfig & { sessionTimestamp?: string }, userId: number): Promise<FlowResult> {
    const authStore = useAuthStore.getState();
    const sessionDir = config.sessionTimestamp || new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = path.join(process.cwd(), 'screenshots', `user-${userId}`, sessionDir, 'signin');
    
    try {
      console.log(`User ${userId}: Starting Auth0 login flow...`);
      await fs.mkdir(screenshotDir, { recursive: true });

      async function takeScreenshot(step: string) {
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const filename = `${timestamp}-${step}.png`;
          const filepath = path.join(screenshotDir, filename);
          await page.screenshot({ path: filepath, fullPage: true });
          console.log(`User ${userId}: Screenshot saved for step: ${step}`);
        } catch (error) {
          console.error(`User ${userId}: Failed to take screenshot:`, error);
        }
      }

      // Clear any existing Auth0 cookies and storage
      const context = page.browserContext();
      const cookies = await context.cookies();
      await Promise.all(cookies.map(cookie => context.deleteCookie(cookie)));
      await page.evaluate(() => {
        window.sessionStorage.clear();
        window.localStorage.clear();
      });

      // Generate secure state and nonce
      const { state, nonce } = this.generateStateAndNonce();

      // First navigate to Auth0's domain to establish proper session context
      await page.goto(`https://${this.auth0Domain}`, {
        waitUntil: ['domcontentloaded'],
        timeout: 15000
      });

      // Set up state and nonce in session storage
      await page.evaluate((params) => {
        window.sessionStorage.setItem('auth0_state', params.state);
        window.sessionStorage.setItem('auth0_nonce', params.nonce);
      }, { state, nonce });

      // Construct Auth0 URL with proper state and nonce
      const auth0Url = `https://${this.auth0Domain}/authorize?` +
        'client_id=e9THhptWHEqAAEAS9BldiimxUyK2mf37' +
        '&redirect_uri=' + encodeURIComponent(`${config.baseUrl}/auth/callback`) +
        '&response_type=code' +
        '&scope=openid%20profile%20email' +
        `&state=${state}` +
        `&nonce=${nonce}` +
        '&prompt=login'; // Force fresh login

      // Navigate to Auth0 authorization endpoint
      await page.goto(auth0Url, {
        waitUntil: ['domcontentloaded'],
        timeout: 15000
      });
      await takeScreenshot('auth0-initial');

      // Wait for Auth0 domain to be in URL and form to be ready
      await page.waitForFunction(
        (domain) => window.location.href.includes(domain) && document.querySelector('form') !== null,
        { timeout: 10000 },
        this.auth0Domain
      );
      await takeScreenshot('auth0-loaded');

      // Find and fill email
      const emailInput = await page.waitForSelector('input[type="text"], input[type="email"], #username', {
        visible: true,
        timeout: 10000
      });
      await takeScreenshot('before-email');
      await emailInput?.type(this.credentials.email, { delay: 100 });
      await takeScreenshot('after-email');
      await emailInput?.press('Enter');
      await takeScreenshot('after-email-submit');

      // Small wait for password field animation
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Find and fill password
      const passwordInput = await page.waitForSelector('input[type="password"], #password', {
        visible: true,
        timeout: 10000
      });
      await takeScreenshot('before-password');
      await passwordInput?.type(this.credentials.password, { delay: 100 });
      await takeScreenshot('after-password');

      // Click the submit button
      const submitButton = await page.waitForSelector('button[type="submit"]', {
        visible: true,
        timeout: 10000
      });
      await submitButton?.click();
      await takeScreenshot('after-password-submit');

      // Wait for and handle the auth callback with retries
      const authSuccess = await this.waitForAuthCallback(page, config, userId);
      
      if (authSuccess) {
        // Attempt to sync the user with retries
        const syncSuccess = await syncAuth(async () => {
          const response = await page.evaluate(async () => {
            const res = await fetch('/api/auth/sync');
            if (!res.ok) throw new Error('Sync failed');
            return res.json();
          });
          return response;
        });

        if (syncSuccess) {
          authStore.setAuthenticated(true);
          console.log(`User ${userId}: Authentication and sync completed successfully`);
          return {
            success: true,
            details: 'Successfully completed login flow and user sync'
          };
        }
      }

      // If we get here, authentication or sync failed
      console.error(`User ${userId}: Auth flow failed, current URL: ${page.url()}`);
      authStore.setAuthenticated(false);
      return {
        success: false,
        error: new Error('Failed to complete authentication flow'),
        details: 'Login flow failed - could not complete auth chain'
      };

    } catch (error) {
      console.error(`User ${userId}: Auth0 login flow failed:`, error);
      authStore.setAuthenticated(false);
      
      // Take final error screenshot
      try {
        const errorScreenshotPath = path.join(
          screenshotDir,
          `${new Date().toISOString().replace(/[:.]/g, '-')}-error-state.png`
        );
        await page.screenshot({ path: errorScreenshotPath, fullPage: true });
      } catch (screenshotError) {
        console.error(`User ${userId}: Failed to take error screenshot:`, screenshotError);
      }
      
      return {
        success: false,
        error: error as Error,
        details: 'Login flow failed with error'
      };
    }
  }
}
