import { Page } from 'puppeteer';
import { FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';
import { BaseFlow } from './base';

export class PravidlaFlow extends BaseFlow {
  name = 'pravidla';

  getSteps(): FlowStep[] {
    return [
      { 
        selector: '[href="/pravidla-ucasti"]', 
        action: 'click',
        waitForNavigation: true 
      },
      { 
        selector: 'body', 
        action: 'wait',
        value: 1000  // Wait for content to load
      },
      { 
        selector: '[id^="radix-"]:has(.text-2xl)', 
        action: 'findAndClickAll',
        value: 3  // Click up to 3 random rule sections
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
      console.log('Starting pravidla flow...');

      // Navigate to pravidla page
      await page.goto(`${config.baseUrl}/pravidla-ucasti`, {
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
            details: 'Pravidla flow failed'
          };
        }
      }

      return {
        success: true,
        details: 'Successfully executed pravidla flow'
      };

    } catch (error) {
      console.error('Pravidla flow failed:', error);
      return {
        success: false,
        error: error as Error,
        details: 'Pravidla flow failed with error'
      };
    }
  }
}
