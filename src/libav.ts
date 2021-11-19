/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021 Yahweasel
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

import type * as LibAVJS from "libav.js";
declare let LibAV: LibAVJS.LibAVWrapper;

// Currently available libav instances
const libavs: LibAVJS.LibAV[] = [];

// Options required to create a LibAV instance
let libavOptions: any = {};

/**
 * Supported decoders.
 */
export let decoders: string[] = null;

/**
 * Supported encoders.
 */
export let encoders: string[] = null;

/**
 * libav.js-specific codec request, used to bypass the codec registry and use
 * anything your implementation of libav.js supports.
 */
export interface LibAVJSCodec {
    codec: string,
    ctx?: LibAVJS.AVCodecContextProps,
    options?: Record<string, string>
}

/**
 * Set the libav loading options.
 */
export function setLibAVOptions(to: any) {
    libavOptions = to;
}

/**
 * Get a libav instance.
 */
export async function get(): Promise<LibAVJS.LibAV> {
    if (libavs.length)
        return libavs.shift();
    return await LibAV.LibAV(libavOptions);
}

/**
 * Free a libav instance for later reuse.
 */
export function free(libav: LibAVJS.LibAV) {
    libavs.push(libav);
}

/**
 * Get the list of encoders/decoders supported by libav (which are also
 * supported by this polyfill)
 * @param encoders  Check for encoders instead of decoders
 */
async function codecs(encoders: boolean): Promise<string[]> {
    const libav = await get();
    const ret: string[] = [];

    for (const [avname, codec] of [
        ["flac", "flac"],
        ["libopus", "opus"],
        ["libvorbis", "vorbis"],
        ["libaom-av1", "av01"],
        ["libvpx-vp9", "vp09"],
        ["libvpx", "vp8"]
    ]) {
        if (encoders) {
            if (await libav.avcodec_find_encoder_by_name(avname))
                ret.push(codec);
        } else {
            if (await libav.avcodec_find_decoder_by_name(avname))
                ret.push(codec);
        }
    }

    free(libav);
    return ret;
}

/**
 * Load the lists of supported decoders and encoders.
 */
export async function load() {
    decoders = await codecs(false);
    encoders = await codecs(true);
}

/**
 * Convert a decoder from the codec registry (or libav.js-specific parameters)
 * to libav.js. Returns null if unsupported.
 */
export function decoder(
    codec: string | {libavjs: LibAVJSCodec}
): LibAVJSCodec {
    if (typeof codec === "string") {
        codec = codec.replace(/\..*/, "");
        if (!(decoders.indexOf(codec) >= 0))
            return null;

        let outCodec: string = codec;
        switch (codec) {
            // Audio
            case "opus":
                outCodec = "libopus";
                break;

            case "vorbis":
                outCodec = "libvorbis";
                break;

            // Video
            case "av01":
                outCodec = "libaom-av1";
                break;

            case "vp09":
                outCodec = "libvpx-vp9";
                break;

            case "vp8":
                outCodec = "libvpx";
                break;
        }

        return {codec: outCodec};

    } else {
        return codec.libavjs;

    }
}

/**
 * Convert an encoder from the codec registry (or libav.js-specific parameters)
 * to libav.js. Returns null if unsupported.
 */
export function encoder(
    codec: string | {libavjs: LibAVJSCodec}, config: any
): LibAVJSCodec {
    if (typeof codec === "string") {
        codec = codec.replace(/\..*/, "");
        if (!(encoders.indexOf(codec) >= 0))
            return null;

        let outCodec: string = codec;
        const ctx: LibAVJS.AVCodecContextProps = {};
        const options: Record<string, string> = {};
        let video = false;
        switch (codec) {
            // Audio
            case "flac":
                ctx.sample_fmt = 2 /* S32 */;
                ctx.bit_rate = 0;
                break;

            case "opus":
                outCodec = "libopus";
                ctx.sample_fmt = 3 /* FLT */;
                ctx.sample_rate = 48000;
                break;

            case "vorbis":
                outCodec = "libvorbis";
                ctx.sample_fmt = 8 /* FLTP */;
                break;

            // Video
            case "av01":
                video = true;
                outCodec = "libaom-av1";
                if (config.latencyMode === "realtime") {
                    options.usage = "realtime";
                    options["cpu-used"] = "8";
                }
                break;

            case "vp09":
                video = true;
                outCodec = "libvpx-vp9";
                if (config.latencyMode === "realtime") {
                    options.quality = "realtime";
                    options["cpu-used"] = "8";
                }
                break;

            case "vp8":
                video = true;
                outCodec = "libvpx";
                if (config.latencyMode === "realtime") {
                    options.quality = "realtime";
                    options["cpu-used"] = "8";
                }
                break;
        }

        if (video) {
            ctx.pix_fmt = 0 /* YUV420P */;
            ctx.width = config.width;
            ctx.height = config.height;

            if (config.framerate) {
                /* FIXME: We need this as a rational, not a floating point, and
                 * this is obviously not the right way to do it */
                ctx.framerate_num = Math.round(config.framerate);
                ctx.framerate_den = 1;
            }

        } else {
            if (!ctx.sample_rate)
                ctx.sample_rate = config.sampleRate || 48000;
            if (config.numberOfChannels) {
                const n = config.numberOfChannels;
                ctx.channel_layout = (n === 1) ? 4 : ((1<<n)-1);
            }
        }

        if (typeof ctx.bit_rate !== "number" && config.bitrate) {
            // NOTE: CBR requests are, quite rightly, ignored
            ctx.bit_rate = config.bitrate;
        }

        return {
            codec: outCodec,
            ctx, options
        };

    } else {
        return codec.libavjs;

    }
}
