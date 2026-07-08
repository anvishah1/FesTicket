"use client";

// frontend/lib/api.ts
//
// FE-02: a small typed data layer over SWR that goes through apiFetch (so access-
// token injection + single-flight refresh keep working) and normalizes the two
// response shapes in the app — the {success,data,error,pagination} envelope and
// the older bare-object bodies. Replaces the hand-rolled
// useState(loading/error/data)+useEffect(fetch)+reloadKey bookkeeping duplicated
// across the data-loading pages, and gives dedup + stale-while-revalidate for
// free.

import useSWR, { type SWRConfiguration, type KeyedMutator } from "swr";
import { useCallback } from "react";
import { apiFetch } from "@/lib/auth";

export type Pagination = { page: number; limit: number; total: number; totalPages: number };

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

// A parsed API response: the unwrapped payload + optional pagination (present on
// list endpoints). Bare-body responses put the whole body in `data`.
type Parsed<T> = { data: T; pagination?: Pagination };

async function fetcher<T>(path: string): Promise<Parsed<T>> {
  // redirectOnAuthFailure:false — a hook must never hard-navigate the page; it
  // surfaces the error instead.
  const res = await apiFetch(path, {}, { redirectOnAuthFailure: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: any = await res.json().catch(() => null);

  if (!res.ok) {
    throw new ApiError(
      body?.error?.message || body?.message || `Request failed (${res.status})`,
      res.status,
      body?.error?.code
    );
  }
  // Enveloped {success,data,...}
  if (body && typeof body === "object" && "success" in body) {
    if (body.success === false) {
      throw new ApiError(body.error?.message || "Request was not successful", res.status, body.error?.code);
    }
    return { data: body.data as T, pagination: body.pagination as Pagination | undefined };
  }
  // Bare body (auth/user/roleRequests legacy shape)
  return { data: body as T };
}

export type UseApiResult<T> = {
  data: T | undefined;
  pagination: Pagination | undefined;
  error: ApiError | undefined;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<Parsed<T>>;
};

// Fetch `key` (an /api path, or null/false to disable). opts are passed straight
// to SWR — e.g. `fallbackData` (SSR seed), `keepPreviousData` (FE-08),
// `revalidateOnFocus`, `refreshInterval`.
export function useApi<T = unknown>(
  key: string | null | false,
  opts?: SWRConfiguration<Parsed<T>, ApiError>
): UseApiResult<T> {
  const swr = useSWR<Parsed<T>, ApiError>(key || null, fetcher, opts);
  return {
    data: swr.data?.data,
    pagination: swr.data?.pagination,
    error: swr.error,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    mutate: swr.mutate,
  };
}

type MutationOptions = {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body?: any;
  redirectOnAuthFailure?: boolean;
};

// One-shot mutations (never cached as GETs). Returns the unwrapped `data` payload
// and throws ApiError on failure — the caller updates SWR caches via `mutate`.
export function useApiMutation() {
  return useCallback(async <T = unknown>(path: string, opts: MutationOptions = {}): Promise<T> => {
    const { method = "POST", body, redirectOnAuthFailure = false } = opts;
    const res = await apiFetch(
      path,
      {
        method,
        headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      },
      { redirectOnAuthFailure }
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = await res.json().catch(() => null);
    if (!res.ok || parsed?.success === false) {
      throw new ApiError(
        parsed?.error?.message || parsed?.message || `Request failed (${res.status})`,
        res.status,
        parsed?.error?.code
      );
    }
    return (parsed && typeof parsed === "object" && "success" in parsed ? parsed.data : parsed) as T;
  }, []);
}
