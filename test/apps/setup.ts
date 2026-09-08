///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz. All rights reserved.
///////////////////////////////////////////////////////////////////////////////
// Global setup for the frontend (apps/www) test suite. Vitest applies `setupFiles` across every test
// environment configured for this project, including the plain `node` environment the backend
// `test/**/*.test.ts` suite runs under — guard everything here on `document` actually existing so this
// file is a no-op for those tests rather than throwing on a DOM API that isn't present.
import "@testing-library/jest-dom/vitest";

if (typeof document !== "undefined") {
    const { cleanup } = await import("@testing-library/react");
    afterEach(() => {
        cleanup();
    });

    // jsdom doesn't implement `window.matchMedia` at all (confirmed: it's simply `undefined`, not a
    // stub that always returns non-matching). Default every test to "never matches" (i.e. `useIsMobile()`
    // reads as desktop, exactly today's pre-mobile-refactor behavior) so the many existing tests that
    // don't know `useIsMobile` exists keep passing unmodified; a test that needs the mobile branch calls
    // `mockMatchMedia(true)` (see `testUtils.ts`) to override this default.
    if (typeof window.matchMedia !== "function") {
        window.matchMedia = (query: string) =>
            ({
                matches: false,
                media: query,
                onchange: null,
                addEventListener: vi.fn(),
                removeEventListener: vi.fn(),
                addListener: vi.fn(),
                removeListener: vi.fn(),
                dispatchEvent: vi.fn(() => false),
            }) as MediaQueryList;
    }
}
