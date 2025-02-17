import { Page } from 'puppeteer';
import { FlowStep, FlowConfig } from './types';
import { setTimeout } from 'timers/promises';
import path from 'path';
import fs from 'fs/promises';

export function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Add screenshot utility function
async function takeScreenshot(page: Page, userId: number, flowName: string, stepDescription: string) {
  try {
    // Create screenshots directory if it doesn't exist
    const screenshotDir = path.join(process.cwd(), 'screenshots', `user-${userId}`, flowName);
    await fs.mkdir(screenshotDir, { recursive: true });

    // Create timestamp and sanitize step description for filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sanitizedStep = stepDescription.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    
    // Save screenshot
    const screenshotPath = path.join(screenshotDir, `${timestamp}-${sanitizedStep}.png`);
    await page.screenshot({
      path: screenshotPath,
      fullPage: true
    });

    // console.log(`Screenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.error('Failed to take screenshot:', error);
  }
}

export async function findAndClickRandomElements(
  page: Page, 
  selector: string, 
  maxClicks: number, 
  config: FlowConfig,
  userId: number,
  flowName: string
): Promise<boolean> {
  try {
    await takeScreenshot(page, userId, flowName, `before-find-and-click-${selector}`);
    await page.waitForSelector(selector, { timeout: config.stepTimeout });
    const elements = await page.$$(selector);
    if (!elements.length) return false;

    const clickCount = Math.min(maxClicks, elements.length);
    const indexes = Array.from({length: elements.length}, (_, i) => i);
    
    for (let i = 0; i < clickCount; i++) {
      const randomIndex = Math.floor(Math.random() * indexes.length);
      const elementIndex = indexes.splice(randomIndex, 1)[0];
      await takeScreenshot(page, userId, flowName, `before-click-${i+1}-of-${clickCount}`);
      await elements[elementIndex].click();
      await setTimeout(getRandomDelay(config.minWaitMs, config.maxWaitMs));
    }
    
    return true;
  } catch (error) {
    console.log(`Failed to find and click elements matching ${selector}:`, error);
    return false;
  }
}

export async function executeFlowStep(
  page: Page, 
  step: FlowStep, 
  config: FlowConfig,
  userId: number,
  flowName: string
): Promise<boolean> {
  const navigationOptions = config.navigationOptions || {
    waitUntil: ['domcontentloaded'] as const,
    timeout: 30000
  };

  for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
    try {
      // Take screenshot before executing step
      await takeScreenshot(page, userId, flowName, `${step.action}-${step.selector}-attempt-${attempt}`);

      // Wait for any pending navigations
      await page.waitForNavigation(navigationOptions)
        .catch(() => console.log('No navigation pending'));

      // Add 1s wait before each step attempt
      await setTimeout(1000);

      switch (step.action) {
        case 'findAndClickAll':
          if (typeof step.value !== 'number') throw new Error('Missing value for findAndClickAll');
          return await findAndClickRandomElements(page, step.selector, step.value, config, userId, flowName);
          
        case 'click':
          await page.waitForSelector(step.selector, { timeout: config.stepTimeout });
          if (step.waitForNavigation) {
            await Promise.all([
              page.waitForNavigation(navigationOptions),
              page.click(step.selector)
            ]);
          } else {
            await page.click(step.selector);
          }
          break;
          
        case 'type':
          await page.waitForSelector(step.selector, { timeout: config.stepTimeout });
          if (typeof step.value === 'string') {
            if (step.value === '\n') {
              await Promise.all([
                page.waitForNavigation(navigationOptions).catch(() => {}),
                page.type(step.selector, step.value)
              ]);
            } else {
              await page.type(step.selector, step.value);
            }
          }
          break;
          
        case 'scroll':
          if (typeof step.value === 'number') {
            await page.evaluate((y) => window.scrollBy(0, y), step.value);
          }
          break;
          
        case 'wait':
          await setTimeout(step.value as number || config.minWaitMs);
          break;
      }

      // Take screenshot after successful step execution
      await takeScreenshot(page, userId, flowName, `${step.action}-${step.selector}-completed`);

      // Wait 1s after successful step
      await setTimeout(1000);
      return true;
    } catch (error) {
      console.log(`Attempt ${attempt}/${config.retryAttempts} failed for ${step.action} on ${step.selector}:`, error);
      if (attempt < config.retryAttempts) {
        // Increasing wait time with each retry: 1s, 2s, 3s
        const retryDelay = attempt * 1000;
        // console.log(`Waiting ${retryDelay}ms before retry...`);
        await setTimeout(retryDelay);
      } else {
        // Take screenshot of failure state
        await takeScreenshot(page, userId, flowName, `${step.action}-${step.selector}-failed`);
        return false;
      }
    }
  }
  return false;
} 