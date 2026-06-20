export function assertNever(value: never, message = `Unexpected value: ${value}`): never {
  throw new Error(message);
}
