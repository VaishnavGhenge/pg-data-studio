// Thin wrapper around window.api: unwraps the {ok,data}/{ok:false,error}
// envelope so callers get a plain value or a thrown error, instead of
// checking `.ok` at every call site.

export class ApiError extends Error {}

export async function unwrap<T>(promise: Promise<IpcResult<T>>): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new ApiError(res.error);
  return res.data;
}

// Like unwrap, but resolves to a fallback instead of throwing — for call
// sites (e.g. loading the sources list) where a failure should silently
// degrade rather than interrupt the flow.
export async function unwrapOr<T>(promise: Promise<IpcResult<T>>, fallback: T): Promise<T> {
  const res = await promise;
  return res.ok ? res.data : fallback;
}

export function useApi(): Api {
  return window.api;
}
