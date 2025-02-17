import { Page } from 'puppeteer';
import { FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';
import { BaseFlow } from './base';

export class ProfileFlow extends BaseFlow {
  name = 'profile';

  getSteps(): FlowStep[] {
    return [
      { 
        selector: '[href="/profile"]', 
        action: 'click',
        waitForNavigation: true
      },
      { 
        selector: 'body', 
        action: 'scroll', 
        value: 360 
      },
      { 
        selector: 'button:has-text("Fetch User Details")', 
        action: 'click' 
      },
      { 
        selector: 'button:has-text("Test Role Sync")', 
        action: 'click' 
      }
    ];
  }

  async execute(page: Page, config: FlowConfig, userId: number): Promise<FlowResult> {
    try {
      console.log('Starting profile flow...');

      // Navigate to profile page
      await page.goto(`${config.baseUrl}/profile`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Execute each step
      for (const step of this.getSteps()) {
        const success = await executeFlowStep(page, step, config, userId, this.name);
        if (!success) {
          return {
            success: false,
            error: new Error(`Failed to execute step: ${step.action} on ${step.selector}`),
            details: 'Profile flow failed'
          };
        }
      }

      return {
        success: true,
        details: 'Successfully executed profile flow'
      };

    } catch (error) {
      console.error('Profile flow failed:', error);
      return {
        success: false,
        error: error as Error,
        details: 'Profile flow failed with error'
      };
    }
  }
}
