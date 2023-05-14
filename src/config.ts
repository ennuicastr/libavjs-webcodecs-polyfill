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

import * as eac from "./encoded-audio-chunk";
import * as ad from "./audio-data";
import * as adec from "./audio-decoder";
import * as aenc from "./audio-encoder";

import * as evc from "./encoded-video-chunk";
import * as vf from "./video-frame";
import * as vdec from "./video-decoder";
import * as venc from "./video-encoder";
import '@ungap/global-this';

/**
 * An AudioDecoder environment.
 */
export interface AudioDecoderEnvironment {
    AudioDecoder: typeof adec.AudioDecoder,
    EncodedAudioChunk: typeof eac.EncodedAudioChunk,
    AudioData: typeof ad.AudioData
}

/**
 * A VideoDecoder environment.
 */
export interface VideoDecoderEnvironment {
    VideoDecoder: typeof vdec.VideoDecoder,
    EncodedVideoChunk: typeof evc.EncodedVideoChunk,
    VideoFrame: typeof vf.VideoFrame
}

/**
 * An AudioEncoder environment.
 */
export interface AudioEncoderEnvironment {
    AudioEncoder: typeof aenc.AudioEncoder,
    EncodedAudioChunk: typeof eac.EncodedAudioChunk,
    AudioData: typeof ad.AudioData
}

/**
 * A VideoEncoder environment.
 */
export interface VideoEncoderEnvironment {
    VideoEncoder: typeof venc.VideoEncoder,
    EncodedVideoChunk: typeof evc.EncodedVideoChunk,
    VideoFrame: typeof vf.VideoFrame
}

/**
 * Error thrown to indicate a configuration is unsupported.
 */
export class UnsupportedException extends Error {
    constructor() {
        super("The requested configuration is not supported");
    }
}

/**
 * Get an AudioDecoder environment that supports this configuration. Throws an
 * UnsupportedException if no environment supports the configuration.
 * @param config  Audio decoder configuration
 */
export async function getAudioDecoder(
    config: adec.AudioDecoderConfig
): Promise<AudioDecoderEnvironment> {
    try {
        if (typeof (<any> globalThis).AudioDecoder !== "undefined" &&
            (await (<any> globalThis).AudioDecoder.isConfigSupported(config)).supported) {
            return {
                AudioDecoder: (<any> globalThis).AudioDecoder,
                EncodedAudioChunk: (<any> globalThis).EncodedAudioChunk,
                AudioData: (<any> globalThis).AudioData
            };
        }
    } catch (ex) {}

    if ((await adec.AudioDecoder.isConfigSupported(config)).supported) {
        return {
            AudioDecoder: adec.AudioDecoder,
            EncodedAudioChunk: eac.EncodedAudioChunk,
            AudioData: ad.AudioData
        };
    }

    throw new UnsupportedException();
}

/**
 * Get an VideoDecoder environment that supports this configuration. Throws an
 * UnsupportedException if no environment supports the configuration.
 * @param config  Video decoder configuration
 */
export async function getVideoDecoder(
    config: vdec.VideoDecoderConfig
): Promise<VideoDecoderEnvironment> {
    try {
        if (typeof (<any> globalThis).VideoDecoder !== "undefined" &&
            (await (<any> globalThis).VideoDecoder.isConfigSupported(config)).supported) {
            return {
                VideoDecoder: (<any> globalThis).VideoDecoder,
                EncodedVideoChunk: (<any> globalThis).EncodedVideoChunk,
                VideoFrame: (<any> globalThis).VideoFrame
            };
        }
    } catch (ex) {}

    if ((await vdec.VideoDecoder.isConfigSupported(config)).supported) {
        return {
            VideoDecoder: vdec.VideoDecoder,
            EncodedVideoChunk: evc.EncodedVideoChunk,
            VideoFrame: vf.VideoFrame
        };
    }

    throw new UnsupportedException();
}

/**
 * Get an AudioEncoder environment that supports this configuration. Throws an
 * UnsupportedException if no environment supports the configuration.
 * @param config  Audio encoder configuration
 */
export async function getAudioEncoder(
    config: aenc.AudioEncoderConfig
): Promise<AudioEncoderEnvironment> {
    try {
        if (typeof (<any> globalThis).AudioEncoder !== "undefined" &&
            (await (<any> globalThis).AudioEncoder.isConfigSupported(config)).supported) {
            return {
                AudioEncoder: (<any> globalThis).AudioEncoder,
                EncodedAudioChunk: (<any> globalThis).EncodedAudioChunk,
                AudioData: (<any> globalThis).AudioData
            };
        }
    } catch (ex) {}

    if ((await aenc.AudioEncoder.isConfigSupported(config)).supported) {
        return {
            AudioEncoder: aenc.AudioEncoder,
            EncodedAudioChunk: eac.EncodedAudioChunk,
            AudioData: ad.AudioData
        };
    }

    throw new UnsupportedException();
}

/**
 * Get an VideoEncoder environment that supports this configuration. Throws an
 * UnsupportedException if no environment supports the configuration.
 * @param config  Video encoder configuration
 */
export async function getVideoEncoder(
    config: venc.VideoEncoderConfig
): Promise<VideoEncoderEnvironment> {
    try {
        if (typeof (<any> globalThis).VideoEncoder !== "undefined" &&
            (await (<any> globalThis).VideoEncoder.isConfigSupported(config)).supported) {
            return {
                VideoEncoder: (<any> globalThis).VideoEncoder,
                EncodedVideoChunk: (<any> globalThis).EncodedVideoChunk,
                VideoFrame: (<any> globalThis).VideoFrame
            };
        }
    } catch (ex) {}

    if ((await venc.VideoEncoder.isConfigSupported(config)).supported) {
        return {
            VideoEncoder: venc.VideoEncoder,
            EncodedVideoChunk: evc.EncodedVideoChunk,
            VideoFrame: vf.VideoFrame
        };
    }

    throw new UnsupportedException();
}
