import re
from typing import Optional, List

def time_string_to_minutes(time_str: Optional[str]) -> int:
    """
    Converts a time string like '1w 2d 3h 30m' to total minutes.
    Assumes: 1w = 5d, 1d = 8h (standard working units, but can be adjusted).
    Let's use more standard: 1w = 7d, 1d = 24h for general tasks, 
    or 1w = 5d, 1d = 8h for work items.
    Given the 'Project/Story' context, work units might be better.
    Let's stick to standard calendar for now or configurable.
    User format: 1w 2d 3h 30m
    """
    if not time_str:
        return 0
    
    total_minutes = 0
    # Match pairs of (number, unit)
    tokens = re.findall(r'(\d+)([wdhm])', time_str.lower())
    
    for amount, unit in tokens:
        amount = int(amount)
        if unit == 'w':
            total_minutes += amount * 5 * 8 * 60  # 1 week = 5 days * 8 hours
        elif unit == 'd':
            total_minutes += amount * 8 * 60      # 1 day = 8 hours
        elif unit == 'h':
            total_minutes += amount * 60
        elif unit == 'm':
            total_minutes += amount
            
    return total_minutes

def minutes_to_time_string(minutes: int) -> Optional[str]:
    """
    Converts minutes back to '1w 2d 3h 30m' format.
    """
    if minutes <= 0:
        return None
    
    w = minutes // (5 * 8 * 60)
    minutes %= (5 * 8 * 60)
    
    d = minutes // (8 * 60)
    minutes %= (8 * 60)
    
    h = minutes // 60
    m = minutes % 60
    
    parts = []
    if w > 0: parts.append(f"{w}w")
    if d > 0: parts.append(f"{d}d")
    if h > 0: parts.append(f"{h}h")
    if m > 0: parts.append(f"{m}m")
    
    return " ".join(parts) if parts else None

def sum_time_strings(time_strings: List[Optional[str]]) -> Optional[str]:
    """
    Sums a list of time strings and returns the result in the same format.
    """
    total_mins = sum(time_string_to_minutes(ts) for ts in time_strings if ts)
    return minutes_to_time_string(total_mins)
