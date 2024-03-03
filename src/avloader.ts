/*
 * This file is part of the libav.js WebCodecs Polyfill implementation. The
 * interface implemented is derived from the W3C standard. No attribution is
 * required when using this library.
 *
 * Copyright (c) 2021-2024 Yahweasel
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

import type * as LibAVJS from "@libav.js/variant-webm-vp9";
declare let LibAV: LibAVJS.LibAVWrapper;

// Wrapper function to use
export let LibAVWrapper: LibAVJS.LibAVWrapper | null = null;

// Currently available libav instances
const libavs: LibAVJS.LibAV[] = [];

// Options required to create a LibAV instance
let libavOptions: any = {};

/**
 * Supported decoders.
 */
export let decoders: string[] | null = null;

/**
 * Supported encoders.
 */
export let encoders: string[] | null = null;

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
 * Set the libav wrapper to use.
 */
export function setLibAV(to: LibAVJS.LibAVWrapper) {
    LibAVWrapper = to;
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
        return libavs.shift()!;
    return await LibAVWrapper!.LibAV(libavOptions);
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
    LibAVWrapper = LibAVWrapper || LibAV;
    decoders = await codecs(false);
    encoders = await codecs(true);
}

/**
 * Convert a decoder from the codec registry (or libav.js-specific parameters)
 * to libav.js. Returns null if unsupported.
 */
export function decoder(
    codec: string | {libavjs: LibAVJSCodec}, config: any
): LibAVJSCodec | null {
    if (typeof codec === "string") {
        codec = codec.replace(/\..*/, "");

        let outCodec: string = codec;
        switch (codec) {
            // Audio
            case "flac":
                if (typeof config.description === "undefined") {
                    // description is required per spec, but one can argue, if this limitation makes sense
                    return null;
                }
                break;

            case "opus":
                if (typeof config.description !== "undefined") {
                    // ogg bitstream is not supported by the current implementation
                    return null;
                }
                outCodec = "libopus";
                break;

            case "vorbis":
                if (typeof config.description === "undefined") {
                    // description is required per spec, but one can argue, if this limitation makes sense
                    return null;
                }
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

            // Unsupported
            case "mp3":
            case "mp4a":
            case "ulaw":
            case "alaw":
            case "avc1":
            case "avc3":
            case "hev1":
            case "hvc1":
                return null;

            // Unrecognized
            default:
                throw new TypeError("Unrecognized codec");
        }

        // Check whether we actually support this codec
        if (!(decoders!.indexOf(codec) >= 0))
            return null;

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
): LibAVJSCodec | null {
    if (typeof codec === "string") {
        const codecParts = codec.split(".");
        codec = codecParts[0];

        let outCodec: string = codec;
        const ctx: LibAVJS.AVCodecContextProps = {};
        const options: Record<string, string> = {};
        let video = false;
        switch (codec) {
            // Audio
            case "flac":
                ctx.sample_fmt = 2 /* S32 */;
                ctx.bit_rate = 0;

                if (typeof config.flac === "object" &&
                    config.flac !== null) {
                    const flac: any = config.flac;
                    // FIXME: Check block size
                    if (typeof flac.blockSize === "number")
                        ctx.frame_size = flac.blockSize;
                    if (typeof flac.compressLevel === "number") {
                        // Not supported
                        return null;
                    }
                }
                break;

            case "opus":
                outCodec = "libopus";
                ctx.sample_fmt = 3 /* FLT */;
                ctx.sample_rate = 48000;

                if (typeof config.opus === "object" &&
                    config.opus !== null) {
                    const opus: any = config.opus;
                    // FIXME: Check frame duration
                    if (typeof opus.frameDuration === "number")
                        options.frame_duration = "" + (opus.frameDuration / 1000);
                    if (typeof opus.complexity !== "undefined") {
                        // We don't support the complexity option
                        return null;
                    }
                    if (typeof opus.packetlossperc === "number") {
                        if (opus.packetlossperc < 0 || opus.packetlossperc > 100)
                            return null;
                        options.packet_loss = "" + opus.packetlossperc;
                    }
                    if (typeof opus.useinbandfec === "boolean")
                        options.fec = opus.useinbandfec?"1":"0";
                    if (typeof opus.usedtx === "boolean") {
                        // We don't support the usedtx option
                        return null;
                    }
                    if (typeof opus.format === "string") {
                        // ogg bitstream is not supported
                        if (opus.format !== "opus") return null;
                    }
                }
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

                // Check for advanced options
                if (!av1Advanced(codecParts, ctx))
                    return null;

                break;

            case "vp09":
                video = true;
                outCodec = "libvpx-vp9";

                if (config.latencyMode === "realtime") {
                    options.quality = "realtime";
                    options["cpu-used"] = "8";
                }

                // Check for advanced options
                if (!vp9Advanced(codecParts, ctx))
                    return null;

                break;

            case "vp8":
                video = true;
                outCodec = "libvpx";

                if (config.latencyMode === "realtime") {
                    options.quality = "realtime";
                    options["cpu-used"] = "8";
                }
                break;

            // Unsupported
            case "mp3":
            case "mp4a":
            case "ulaw":
            case "alaw":
            case "avc1":
                return null;

            // Unrecognized
            default:
                throw new TypeError("Unrecognized codec");
        }

        // Check whether we actually support this codec
        if (!(encoders!.indexOf(codec) >= 0))
            return null;

        if (video) {
            if (typeof ctx.pix_fmt !== "number")
                ctx.pix_fmt = 0 /* YUV420P */;
            const width = ctx.width = config.width;
            const height = ctx.height = config.height;

            if (config.framerate) {
                /* FIXME: We need this as a rational, not a floating point, and
                 * this is obviously not the right way to do it */
                ctx.framerate_num = Math.round(config.framerate);
                ctx.framerate_den = 1;
            }

            // Check for non-square pixels
            const dWidth = config.displayWidth || config.width;
            const dHeight = config.displayHeight || config.height;
            if (dWidth !== width || dHeight !== height) {
                ctx.sample_aspect_ratio_num = dWidth * height;
                ctx.sample_aspect_ratio_den = dHeight * width;
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

/**
 * Handler for advanced options for AV1.
 * @param codecParts  .-separated parts of the codec string.
 * @param ctx  Context to populate with advanced options.
 */
function av1Advanced(codecParts: string[], ctx: LibAVJS.AVCodecContextProps) {
    if (codecParts[1]) {
        const profile = +codecParts[1];
        if (profile >= 0 && profile <= 2)
            ctx.profile = profile;
        else
            throw new TypeError("Invalid AV1 profile");
    }

    if (codecParts[2]) {
        const level = +codecParts[2];
        if (level >= 0 && level <= 23)
            ctx.level = level;
        else
            throw new TypeError("Invalid AV1 level");
    }

    if (codecParts[3]) {
        switch (codecParts[3]) {
            case "M":
                // Default
                break;

            case "H":
                if (ctx.level && ctx.level >= 8) {
                    // Valid but unsupported
                    return false;
                } else {
                    throw new TypeError("The AV1 high tier is only available for level 4.0 and up");
                }
                break;

            default:
                throw new TypeError("Invalid AV1 tier");
        }
    }

    if (codecParts[4]) {
        const depth = +codecParts[3];
        if (depth === 10 || depth === 12) {
            // Valid but unsupported
            return false;
        } else if (depth !== 8) {
            throw new TypeError("Invalid AV1 bit depth");
        }
    }

    if (codecParts[5]) {
        // Monochrome
        switch (codecParts[5]) {
            case "0":
                // Default
                break;

            case "1":
                // Valid but unsupported
                return false;

            default:
                throw new TypeError("Invalid AV1 monochrome flag");
        }
    }

    if (codecParts[6]) {
        // Subsampling mode
        switch (codecParts[6]) {
            case "000": // YUV444
                ctx.pix_fmt = 5 /* YUV444P */;
                break;

            case "100": // YUV422
                ctx.pix_fmt = 4 /* YUV422P */;
                break;

            case "110": // YUV420P (default)
                ctx.pix_fmt = 0 /* YUV420P */;
                break;

            case "111": // Monochrome
                return false;

            default:
                throw new TypeError("Invalid AV1 subsampling mode");
        }
    }

    /* The remaining values have to do with color formats, which we don't
     * support correctly anyway */
    return true;
}

/**
 * Handler for advanced options for VP9.
 * @param codecParts  .-separated parts of the codec string.
 * @param ctx  Context to populate with advanced options.
 */
function vp9Advanced(codecParts: string[], ctx: LibAVJS.AVCodecContextProps) {
    if (codecParts[1]) {
        const profile = +codecParts[1];
        if (profile >= 0 && profile <= 3)
            ctx.profile = profile;
        else
            throw new TypeError("Invalid VP9 profile");
    }

    if (codecParts[2]) {
        const level = [+codecParts[2][0], +codecParts[2][1]];
        if (level[0] >= 1 && level[0] <= 4) {
            if (level[1] >= 0 && level[1] <= 1) {
                // OK
            } else {
                throw new TypeError("Invalid VP9 level");
            }
        } else if (level[0] >= 5 && level[0] <= 6) {
            if (level[1] >= 0 && level[1] <= 2) {
                // OK
            } else {
                throw new TypeError("Invalid VP9 level");
            }
        } else {
            throw new TypeError("Invalid VP9 level");
        }
        ctx.level = +codecParts[2];
    }

    if (codecParts[3]) {
        const depth = +codecParts[3];
        if (depth === 10 || depth === 12) {
            // Valid but unsupported
            return false;
        } else if (depth !== 8) {
            throw new TypeError("Invalid VP9 bit depth");
        }
    }

    if (codecParts[4]) {
        const chromaMode = +codecParts[4];
        switch (chromaMode) {
            case 0:
            case 1:
                // FIXME: These are subtly different YUV420P modes, but we treat them the same
                ctx.pix_fmt = 0 /* YUV420P */;
                break;

            case 2: // YUV422
                ctx.pix_fmt = 4 /* YUV422P */;
                break;

            case 3: // YUV444
                ctx.pix_fmt = 5 /* YUV444P */;
                break;

            default:
                throw new TypeError("Invalid VP9 chroma subsampling format");
        }
    }

    /* The remaining values have to do with color formats, which we don't
     * support correctly anyway */
    return true;
}
