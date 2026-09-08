///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026 Jean-Philippe Steinmetz
///////////////////////////////////////////////////////////////////////////////
import config from "../../src/config.mongo.js";
import { ObjectFactory } from "@rapidrest/service-core";
import { Logger } from "@rapidrest/core";
import { BaseGiphySearchRoute } from "../../src/routes/BaseGiphySearchRoute.js";

function giphyApiResponse(gifs: { id: string; title: string }[]) {
    return {
        ok: true,
        json: async () => ({
            data: gifs.map((gif) => ({
                id: gif.id,
                title: gif.title,
                images: {
                    fixed_width_small: { url: `https://media.giphy.com/${gif.id}/small.gif` },
                    fixed_width: { url: `https://media.giphy.com/${gif.id}/medium.gif` },
                    original: { url: `https://media.giphy.com/${gif.id}/original.gif` },
                },
            })),
        }),
    };
}

describe("BaseGiphySearchRoute Tests", () => {
    const objectFactory: ObjectFactory = new ObjectFactory(config, Logger());

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    it("throws INTERNAL_ERROR when no API key is configured (the default — giphy:api_key is unset).", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });

        await expect(route.search("cats")).rejects.toThrow(/not configured/i);
    });

    it("searches Giphy and maps the response down to {id, previewUrl, url, title}.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        const fetchMock = vi.fn().mockResolvedValue(giphyApiResponse([{ id: "g1", title: "Cat" }]));
        vi.stubGlobal("fetch", fetchMock);

        const result = await route.search("cats");

        expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("https://api.giphy.com/v1/gifs/search?"));
        expect(fetchMock.mock.calls[0][0]).toContain("api_key=test-key");
        expect(fetchMock.mock.calls[0][0]).toContain("q=cats");
        expect(result).toEqual([
            { id: "g1", previewUrl: "https://media.giphy.com/g1/small.gif", url: "https://media.giphy.com/g1/original.gif", title: "Cat" },
        ]);
    });

    it("falls back to Giphy's trending feed when no query is given.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        const fetchMock = vi.fn().mockResolvedValue(giphyApiResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        await route.search(undefined, undefined);

        expect(fetchMock.mock.calls[0][0]).toContain("https://api.giphy.com/v1/gifs/trending?");
    });

    it("falls back to Giphy's trending feed when the query is blank/whitespace.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        const fetchMock = vi.fn().mockResolvedValue(giphyApiResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        await route.search("   ");

        expect(fetchMock.mock.calls[0][0]).toContain("/trending?");
    });

    it("clamps an oversized limit down to the maximum.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        const fetchMock = vi.fn().mockResolvedValue(giphyApiResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        await route.search("cats", "9999");

        expect(fetchMock.mock.calls[0][0]).toContain("limit=50");
    });

    it("uses the default limit when none is given.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        const fetchMock = vi.fn().mockResolvedValue(giphyApiResponse([]));
        vi.stubGlobal("fetch", fetchMock);

        await route.search("cats");

        expect(fetchMock.mock.calls[0][0]).toContain("limit=24");
    });

    it("throws INTERNAL_ERROR when Giphy's own response is not ok.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

        await expect(route.search("cats")).rejects.toThrow(/could not reach giphy/i);
    });

    it("throws INTERNAL_ERROR when the network request itself fails.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValue(new TypeError("network down")),
        );

        await expect(route.search("cats")).rejects.toThrow(/could not reach giphy/i);
    });

    it("falls back through fixed_width_small -> fixed_width -> original for the preview URL.", async () => {
        const route = objectFactory.newInstance<BaseGiphySearchRoute>(BaseGiphySearchRoute, { initialize: false });
        (route as any).apiKey = "test-key";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({
                    data: [{ id: "g1", title: "Cat", images: { original: { url: "https://media.giphy.com/g1/original.gif" } } }],
                }),
            }),
        );

        const result = await route.search("cats");

        expect(result[0].previewUrl).toBe("https://media.giphy.com/g1/original.gif");
    });
});
