import { Page } from 'puppeteer';
import { Flow, FlowConfig, FlowResult, FlowStep } from './types';
import { executeFlowStep } from './utils';

export abstract class BaseFlow implements Flow {
  abstract name: string;
  abstract getSteps(): FlowStep[];

  async execute(page: Page, config: FlowConfig, userId: number): Promise<FlowResult> {
    try {
      const steps = this.getSteps();
      
      for (const step of steps) {
        const success = await executeFlowStep(page, step, config, userId, this.name);
        if (!success) {
          return {
            success: false,
            error: new Error(`Failed to execute step: ${step.action} on ${step.selector}`),
            details: `Flow: ${this.name}, Step: ${step.action} on ${step.selector}`
          };
        }
      }
      
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error('Unknown error'),
        details: `Flow: ${this.name}`
      };
    }
  }
} 