export function parseDateRange(input: { from?: string; to?: string }) {
  const to = input.to ? new Date(`${input.to}T23:59:59.999Z`) : new Date();
  const from = input.from
    ? new Date(`${input.from}T00:00:00.000Z`)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    const error = new Error('Invalid date range. Use YYYY-MM-DD.') as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  return { from, to };
}
