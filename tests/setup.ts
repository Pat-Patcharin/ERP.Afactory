import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** Workspace navigation goes through next/navigation; capture the pushes. */
export const routerPush = vi.fn();

/**
 * Route params a test can set before rendering a generic /m/[entity] page.
 * Mutated rather than re-mocked, because vi.mock is hoisted per file.
 */
export const routeParams: Record<string, string> = { entity: "quotation" };

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/inventory",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => routeParams,
  notFound: () => {
    throw new Error("notFound");
  },
}));
