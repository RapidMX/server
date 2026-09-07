///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import config from "../../src/config.mongo.js";
import { AuthMiddleware, ObjectFactory, RouteUtils } from "@rapidrest/service-core";
import { Logger } from "@rapidrest/core";
import {
    enableDevAutoLoginIfApplicable,
    isRunningUnderYarnDev,
    mountDevImpersonationRouteIfApplicable,
} from "../../src/dev/enableDevAutoLogin.js";
import { DevAutoAuthStrategy } from "../../src/dev/DevAutoAuthStrategy.js";
import { DevImpersonationRoute } from "../../src/dev/DevImpersonationRoute.js";

describe("isRunningUnderYarnDev Tests", () => {
    const originalArgv1 = process.argv[1];
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    const originalJestWorkerId = process.env.JEST_WORKER_ID;

    afterEach(() => {
        process.argv[1] = originalArgv1;
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = originalVitest;
        if (originalJestWorkerId === undefined) delete process.env.JEST_WORKER_ID;
        else process.env.JEST_WORKER_ID = originalJestWorkerId;
    });

    it("is true for a .ts entry point with no NODE_ENV/VITEST/JEST_WORKER_ID set.", () => {
        process.argv[1] = "/project/src/server.ts";
        delete process.env.NODE_ENV;
        delete process.env.VITEST;
        delete process.env.JEST_WORKER_ID;

        expect(isRunningUnderYarnDev()).toBe(true);
    });

    it("is false for a compiled .js entry point (production).", () => {
        process.argv[1] = "/project/dist/src/server.js";
        delete process.env.NODE_ENV;

        expect(isRunningUnderYarnDev()).toBe(false);
    });

    it("is false when NODE_ENV is 'production', even from a .ts entry point.", () => {
        process.argv[1] = "/project/src/server.ts";
        process.env.NODE_ENV = "production";

        expect(isRunningUnderYarnDev()).toBe(false);
    });

    it("is false under Vitest, even from a .ts entry point.", () => {
        process.argv[1] = "/project/src/server.ts";
        delete process.env.NODE_ENV;
        process.env.VITEST = "true";

        expect(isRunningUnderYarnDev()).toBe(false);
    });

    it("is false under Jest, even from a .ts entry point.", () => {
        process.argv[1] = "/project/src/server.ts";
        delete process.env.NODE_ENV;
        delete process.env.VITEST;
        process.env.JEST_WORKER_ID = "1";

        expect(isRunningUnderYarnDev()).toBe(false);
    });

    it("is false when there is no entry point at all.", () => {
        delete (process.argv as any)[1];
        delete process.env.NODE_ENV;
        delete process.env.VITEST;
        delete process.env.JEST_WORKER_ID;

        expect(isRunningUnderYarnDev()).toBe(false);
    });
});

describe("enableDevAutoLoginIfApplicable Tests", () => {
    const originalArgv1 = process.argv[1];
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    const originalJestWorkerId = process.env.JEST_WORKER_ID;

    afterEach(() => {
        process.argv[1] = originalArgv1;
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = originalVitest;
        if (originalJestWorkerId === undefined) delete process.env.JEST_WORKER_ID;
        else process.env.JEST_WORKER_ID = originalJestWorkerId;
    });

    it("does nothing outside of yarn dev — never touches AuthMiddleware.", async () => {
        process.argv[1] = "/project/dist/src/server.js";
        const objectFactory: ObjectFactory = new ObjectFactory(config, Logger());
        const logger = { warn: vi.fn() };

        await enableDevAutoLoginIfApplicable(objectFactory, logger);

        expect(logger.warn).not.toHaveBeenCalled();
    });

    it("registers DevAutoAuthStrategy under the 'jwt' name when running under yarn dev.", async () => {
        // Simulates real `yarn dev` conditions — vitest's own environment always sets `VITEST`/a `.ts`-less
        // argv[1] otherwise, which `isRunningUnderYarnDev()` correctly (and must) treat as NOT dev.
        process.argv[1] = "/project/src/server.ts";
        delete process.env.NODE_ENV;
        delete process.env.VITEST;
        delete process.env.JEST_WORKER_ID;
        const logger = { warn: vi.fn() };

        // A mock rather than a real ObjectFactory: `newInstance(SomeClass)` with no explicit name is not
        // guaranteed to return the same cached instance across separate calls (confirmed by trying exactly
        // that here first — a second real `newInstance(AuthMiddleware)` call came back with a fresh instance
        // whose own `@Init` had independently re-registered the real `JWTStrategy`, not the one this function
        // had already mutated). What actually matters — and what the real server relies on — is that
        // `RouteUtils`'s own `AuthMiddleware` reference (however it resolves one) sees this mutation; this
        // test verifies the mutation call itself, which the live `yarn dev` verification in NOTES.md confirms
        // does reach the real shared instance in practice.
        const registerMock = vi.fn();
        const fakeAuthMiddleware = { register: registerMock };
        const objectFactory: any = {
            newInstance: vi.fn(async (cls: any) => (cls === AuthMiddleware ? fakeAuthMiddleware : new DevAutoAuthStrategy())),
        };

        await enableDevAutoLoginIfApplicable(objectFactory, logger);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[dev]"));
        expect(registerMock).toHaveBeenCalledWith("jwt", expect.any(DevAutoAuthStrategy));
    });
});

describe("mountDevImpersonationRouteIfApplicable Tests", () => {
    const originalArgv1 = process.argv[1];
    const originalNodeEnv = process.env.NODE_ENV;
    const originalVitest = process.env.VITEST;
    const originalJestWorkerId = process.env.JEST_WORKER_ID;

    afterEach(() => {
        process.argv[1] = originalArgv1;
        process.env.NODE_ENV = originalNodeEnv;
        if (originalVitest === undefined) delete process.env.VITEST;
        else process.env.VITEST = originalVitest;
        if (originalJestWorkerId === undefined) delete process.env.JEST_WORKER_ID;
        else process.env.JEST_WORKER_ID = originalJestWorkerId;
    });

    it("does nothing outside of yarn dev — never touches RouteUtils or the server.", async () => {
        process.argv[1] = "/project/dist/src/server.js";
        const objectFactory: ObjectFactory = new ObjectFactory(config, Logger());
        const logger = { warn: vi.fn() };
        const server: any = { getApplication: vi.fn() };

        await mountDevImpersonationRouteIfApplicable(server, objectFactory, logger);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(server.getApplication).not.toHaveBeenCalled();
    });

    it("registers a DevImpersonationRoute against the server's application when running under yarn dev.", async () => {
        process.argv[1] = "/project/src/server.ts";
        delete process.env.NODE_ENV;
        delete process.env.VITEST;
        delete process.env.JEST_WORKER_ID;
        const logger = { warn: vi.fn() };

        const registerRouteMock = vi.fn();
        const fakeRouteUtils = { registerRoute: registerRouteMock };
        const fakeApp = {};
        const server: any = { getApplication: vi.fn(() => fakeApp) };
        // Same reasoning as enableDevAutoLoginIfApplicable's own test above: a mock, not a real
        // ObjectFactory, since what matters here is that registerRoute() is called with this server's own
        // application and a DevImpersonationRoute instance, not which specific instance newInstance() hands
        // back for a bare (unnamed) call.
        const objectFactory: any = {
            newInstance: vi.fn(async (cls: any) => (cls === RouteUtils ? fakeRouteUtils : new DevImpersonationRoute())),
        };

        await mountDevImpersonationRouteIfApplicable(server, objectFactory, logger);

        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("[dev]"));
        expect(registerRouteMock).toHaveBeenCalledWith(fakeApp, expect.any(DevImpersonationRoute));
    });
});
