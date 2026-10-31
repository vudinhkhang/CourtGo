/** Public booking filters shared by the home page and legacy redirect. */
export function bookingQuery(input: Record<string, unknown>): URLSearchParams {
  const result = new URLSearchParams();
  const value = (key: string) => typeof input[key] === 'string' ? (input[key] as string).trim() : '';
  const date = value('date');
  if (/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) result.set('date', date);
  const hour = value('hour');
  if (hour && Number.isInteger(Number(hour)) && Number(hour) >= 5 && Number(hour) <= 23) result.set('hour', String(Number(hour)));
  if (value('courtId')) result.set('courtId', value('courtId').slice(0,100));
  if (value('search')) result.set('search', value('search').slice(0, 100));
  for (const key of ['minPrice', 'maxPrice']) {
    const n = value(key);
    if (n && Number.isFinite(Number(n)) && Number(n) >= 0) result.set(key, String(Number(n)));
  }
  if (result.has('minPrice') && result.has('maxPrice') && Number(result.get('minPrice')) > Number(result.get('maxPrice'))) {
    const min = result.get('minPrice')!;
    result.set('minPrice', result.get('maxPrice')!);
    result.set('maxPrice', min);
  }
  if (['court_order', 'time_asc', 'price_asc', 'price_desc'].includes(value('sortBy'))) result.set('sortBy', value('sortBy'));
  return result;
}
export function bookingHomeUrl(input: Record<string, unknown> = {}): string {
  const query = bookingQuery(input).toString();
  return '/' + (query ? '?' + query : '') + '#lich-san-nhanh';
}
