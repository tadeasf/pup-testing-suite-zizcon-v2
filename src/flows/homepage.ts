import { Page } from 'puppeteer';
import { FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';
import { BaseFlow } from './base';

export class HomepageFlow extends BaseFlow {
  name = 'homepage';

  getSteps(): FlowStep[] {
    return [
      { 
        selector: '[href="/"]', 
        action: 'click',
        waitForNavigation: true 
      },
      { 
        selector: 'body', 
        action: 'wait',
        value: 1000  // Wait for content to load
      },
      { 
        selector: '#radix-\\:r7\\: .text-2xl', // After Party & Networking
        action: 'click'
      },
      {
        selector: 'body',
        action: 'scroll',
        value: 540
      },
      {
        selector: '#radix-\\:r9\\: .text-2xl', // Program Highlights
        action: 'click'
      },
      {
        selector: 'body',
        action: 'scroll',
        value: 360
      },
      {
        selector: '#radix-\\:rb\\: .text-2xl', // ŽižCon Intro
        action: 'click'
      },
      {
        selector: '.w-12', // Arrow navigation
        action: 'click'
      },
      {
        selector: 'body',
        action: 'scroll',
        value: -900
      },
      {
        selector: '.w-12',
        action: 'click'
      },
      {
        selector: 'body',
        action: 'scroll',
        value: 720
      },
      {
        selector: '.w-12',
        action: 'click'
      },
      {
        selector: 'body',
        action: 'scroll',
        value: -1260
      },
      // Map interaction
      {
        selector: '#radix-\\:r0\\:-trigger-info', // "Kde nás najdete" button
        action: 'click'
      },
      {
        selector: '#radix-\\:r0\\:-trigger-map', // "Mapa" button
        action: 'click'
      },
      {
        selector: '[alt="Marker"]',
        action: 'click'
      },
      {
        selector: '.leaflet-container',
        action: 'click'
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
      console.log('Starting homepage flow...');

      // Navigate to homepage
      await page.goto(config.baseUrl, {
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
            details: 'Homepage flow failed'
          };
        }
      }

      return {
        success: true,
        details: 'Successfully executed homepage flow'
      };

    } catch (error) {
      console.error('Homepage flow failed:', error);
      return {
        success: false,
        error: error as Error,
        details: 'Homepage flow failed with error'
      };
    }
  }
}
