/**
 * Returns the tomorrow's date string in YYYY-MM-DD format.
 */
export function getTomorrowISO(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow.toISOString().split('T')[0];
}

/**
 * Returns today's date string in YYYY-MM-DD format.
 */
export function getTodayISO(): string {
    return new Date().toISOString().split('T')[0];
}
