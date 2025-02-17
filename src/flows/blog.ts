import { Page } from 'puppeteer';
import { FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';
import { BaseFlow } from './base';

export class BlogFlow extends BaseFlow {
  name = 'blog';

  getSteps(): FlowStep[] {
    return [
      { 
        selector: '[href="/blog"]', 
        action: 'click',
        waitForNavigation: true 
      },
      { 
        selector: '[id^="radix-"]:has(.text-2xl)', 
        action: 'findAndClickAll',
        value: 3 // Click up to 3 random blog posts
      },
      { 
        selector: 'body', 
        action: 'scroll', 
        value: 500 
      }
    ];
  }

  async execute(page: Page, config: FlowConfig, userId: number): Promise<FlowResult> {
    try {
      console.log('Starting blog flow...');

      // Navigate to blog page
      await page.goto(`${config.baseUrl}/blog`, {
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
            details: 'Blog flow failed'
          };
        }
      }

      return {
        success: true,
        details: 'Successfully executed blog flow'
      };

    } catch (error) {
      console.error('Blog flow failed:', error);
      return {
        success: false,
        error: error as Error,
        details: 'Blog flow failed with error'
      };
    }
  }
}
