/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021-2023 Yahweasel
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
 * SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
 * OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
 * CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

import * as rendering from "./rendering";;
import type * as LibAVJS from "libav.js";
import * as libav from "./libav";

// Re-export as public API.
export * from "./encoded-audio-chunk";
export * from "./audio-data";
export * from "./audio-decoder";
export * from "./audio-encoder";
export * from "./encoded-video-chunk";
export * from "./video-frame";
export * from "./video-decoder";
export * from "./video-encoder";
export * from "./config";
export * from "./rendering";
export * from "./misc";

declare let LibAV: LibAVJS.LibAVWrapper;

/**
 * Load LibAV-WebCodecs-Polyfill.
 */
export async function load(options: {
    polyfill?: boolean,
    libavOptions?: any
} = {}) {
    // Set up libavOptions
    let libavOptions: any = {};
    if (options.libavOptions)
        Object.assign(libavOptions, options.libavOptions);

    // Maybe load libav
    if (typeof LibAV === "undefined") {
        await new Promise((res, rej) => {
            // Can't load workers from another origin
            libavOptions.noworker = true;

            // Load libav
            LibAV = <any> {base: "https://unpkg.com/libav.js@3.10.5"};
            const scr = document.createElement("script");
            scr.src = "https://unpkg.com/libav.js@3.10.5/libav-3.10.5.1.2-webm-opus-flac.js";
            scr.onload = res;
            scr.onerror = rej;
            document.body.appendChild(scr);
        });
    }

    // And load the libav handler
    libav.setLibAVOptions(libavOptions);
    await libav.load();

    if (options.polyfill) {
        for (const exp of [
            "EncodedAudioChunk", "AudioData", "AudioDecoder", "AudioEncoder",
            "EncodedVideoChunk", "VideoFrame", "VideoDecoder", "VideoEncoder"
        ]) {
            if (!(<any> window)[exp])
                (<any> window)[exp] = (<any> this)[exp];
        }
    }

    await rendering.load(libavOptions, !!options.polyfill);
}

