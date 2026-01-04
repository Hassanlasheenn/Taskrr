/**
 * TrackBy helper function for Angular *ngFor directives
 * Tracks items by their 'id' property to improve performance
 * Falls back to index if id is not available
 * @param index - The index of the item
 * @param item - The item being tracked (may have an optional 'id' property)
 * @returns The unique identifier (id) for the item, or index as fallback
 */
export function trackById(index: number, item: any): any {
  return item?.id ?? index;
}

