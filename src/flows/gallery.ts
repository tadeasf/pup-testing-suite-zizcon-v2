import { Page } from 'puppeteer';
import { FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';
import { BaseFlow } from './base';

export class GalleryFlow extends BaseFlow {
  name = 'gallery';

  getSteps(): FlowStep[] {
    return [
      { 
        selector: '[href="/gallery"]', 
        action: 'click',
        waitForNavigation: true
      },
      { 
        selector: 'body', 
        action: 'wait',
        value: 1000  // Wait for images to load
      },
      { 
        selector: 'img[alt*="Thumbnail"]', 
        action: 'findAndClickAll',
        value: 3  // Click fewer thumbnails to reduce chance of failure
      },
      { 
        selector: 'body', 
        action: 'scroll', 
        value: 500 
      },
      { 
        selector: 'button[aria-label="Next slide"]', 
        action: 'click' 
      },
      { 
        selector: 'body', 
        action: 'wait',
        value: 500  // Wait for slide transition
      },
      { 
        selector: 'img[alt*="Thumbnail"]', 
        action: 'findAndClickAll',
        value: 2  // Click fewer thumbnails after slide
      }
    ];
  }

  async execute(page: Page, config: FlowConfig, userId: number): Promise<FlowResult> {
    try {
      console.log('Starting gallery flow...');

      // Navigate to gallery page
      await page.goto(`${config.baseUrl}/gallery`, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // Wait for images to load
      await page.waitForSelector('img[alt*="Thumbnail"]', {
        timeout: config.stepTimeout
      });

      // Execute each step
      for (const step of this.getSteps()) {
        const success = await executeFlowStep(page, step, config, userId, this.name);
        if (!success) {
          return {
            success: false,
            error: new Error(`Failed to execute step: ${step.action} on ${step.selector}`),
            details: 'Gallery flow failed'
          };
        }
      }

      return {
        success: true,
        details: 'Successfully executed gallery flow'
      };

    } catch (error) {
      console.error('Gallery flow failed:', error);
      return {
        success: false,
        error: error as Error,
        details: 'Gallery flow failed with error'
      };
    }
  }
}
