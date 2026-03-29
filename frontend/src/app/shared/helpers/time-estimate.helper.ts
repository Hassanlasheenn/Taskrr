export function parseToMinutes(val: string): number {
    if (!val?.trim()) return 0;
    let mins = 0;
    const w = val.match(/(\d+(?:\.\d+)?)w/i);
    const d = val.match(/(\d+(?:\.\d+)?)d/i);
    const h = val.match(/(\d+(?:\.\d+)?)h/i);
    const m = val.match(/(\d+(?:\.\d+)?)m(?!s)/i);
    if (w) mins += parseFloat(w[1]) * 5 * 8 * 60;
    if (d) mins += parseFloat(d[1]) * 8 * 60;
    if (h) mins += parseFloat(h[1]) * 60;
    if (m) mins += parseFloat(m[1]);
    return mins;
}

export function minutesToEstimate(totalMins: number): string {
    if (!totalMins) return '';
    const w = Math.floor(totalMins / (5 * 8 * 60));
    totalMins -= w * 5 * 8 * 60;
    const d = Math.floor(totalMins / (8 * 60));
    totalMins -= d * 8 * 60;
    const h = Math.floor(totalMins / 60);
    const m = Math.round(totalMins - h * 60);
    const parts: string[] = [];
    if (w) parts.push(`${w}w`);
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    return parts.join(' ');
}
