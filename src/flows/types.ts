import { Page } from 'puppeteer';

export interface FlowStep {
  selector: string;
  action: 'click' | 'type' | 'scroll' | 'wait' | 'findAndClickAll';
  value?: string | number;
  timeout?: number;
  waitForNavigation?: boolean;
}

export type WaitUntilOption = 'networkidle0' | 'networkidle2' | 'domcontentloaded' | 'load';

export interface FlowConfig {
  baseUrl: string;
  minWaitMs: number;
  maxWaitMs: number;
  stepTimeout: number;
  retryAttempts: number;
  sessionTimestamp?: string;
  navigationOptions?: {
    waitUntil: WaitUntilOption[];
    timeout: number;
  };
}

export interface FlowResult {
  success: boolean;
  error?: Error;
  details?: string;
}

export interface Flow {
  name: string;
  execute: (page: Page, config: FlowConfig, userId: number) => Promise<FlowResult>;
  getSteps: () => FlowStep[];
  setupRedirectHandling?: (page: Page) => Promise<void>;
} 