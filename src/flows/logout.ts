import { Page } from 'puppeteer';
import { FlowConfig, FlowResult } from './types';
import { BaseFlow } from './base';
import { setTimeout } from 'timers/promises';

export class LogoutFlow extends BaseFlow {
  name = 'logout';

  getSteps() {
    return []; // Logout uses direct navigation instead of steps
  }

  async execute(page: Page, config: FlowConfig, userId: number): Promise<FlowResult> {
    try {
      console.log(`User ${userId}: Executing logout flow...`);
      
      // Direct navigation to logout URL
      await page.goto(`${config.baseUrl}/auth/logout`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });
      
      // Wait for 2 seconds after logout
      await setTimeout(2000);
      
      console.log(`User ${userId}: Logout completed`);
      
      return {
        success: true,
        details: 'Successfully logged out'
      };
    } catch (error) {
      console.log(`User ${userId}: Logout failed:`, error);
      return {
        success: false,
        error: error as Error,
        details: 'Logout flow failed'
      };
    }
  }
}
