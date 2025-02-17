import { useAuthStore } from '../stores/authStore';

const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds

export async function syncAuth<T>(syncFn: () => Promise<T>): Promise<boolean> {
  const authStore = useAuthStore.getState();
  
  if (!authStore.shouldSync()) {
    console.log('Skipping auth sync - not needed or max retries reached');
    return true;
  }

  try {
    let currentDelay = INITIAL_RETRY_DELAY;
    let success = false;

    while (authStore.retryCount < authStore.maxRetries && !success) {
      try {
        await syncFn();
        success = true;
        authStore.setSynced(true);
        authStore.setLastSyncTimestamp(Date.now());
        authStore.resetRetries();
        authStore.setSyncError(null);
        console.log('Auth sync successful');
      } catch (error) {
        console.error('Auth sync failed:', error);
        authStore.incrementRetry();
        authStore.setSyncError(error instanceof Error ? error.message : 'Unknown error');
        
        if (authStore.retryCount < authStore.maxRetries) {
          console.log(`Retrying in ${currentDelay}ms (attempt ${authStore.retryCount} of ${authStore.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, currentDelay));
          currentDelay = Math.min(currentDelay * 2, MAX_RETRY_DELAY);
        }
      }
    }

    return success;
  } catch (error) {
    console.error('Fatal error in auth sync:', error);
    authStore.setSyncError(error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
} 