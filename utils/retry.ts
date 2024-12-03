export class RetryError extends Error {
  attempts: number;
  lastError: Error;

  constructor(message: string, attempts: number, lastError: Error) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

export async function simple<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000,
): Promise<{ result: T; tries: number }> {
  let attempts = 0;

  while (attempts < retries) {
    try {
      const result = await fn();
      return { result, tries: attempts + 1 };
    } catch (error) {
      attempts++;

      if (attempts >= retries) {
        throw new RetryError(
          `Maximum retries reached (${retries}).`,
          attempts,
          error.message,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delay * attempts));
    }
  }
}
