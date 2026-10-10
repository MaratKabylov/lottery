// Bound UI waits even if the underlying SDK request or session lock never settles.
export async function withTimeout<T>(
  operation: PromiseLike<T>,
  message: string,
  milliseconds = 15_000,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve(operation),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
