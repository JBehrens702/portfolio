/** A copy of the object without the key, for example a file field that the owner removed. */
export function omit<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = value;
  void _removed;
  return rest;
}
