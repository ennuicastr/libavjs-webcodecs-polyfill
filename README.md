# LibAVJS-WebCodecs-Polyfill

This is a polyfill for the [WebCodecs API](https://w3c.github.io/webcodecs/).

No, really.

It supports the `VideoEncoder`, `AudioEncoder`, `VideoDecoder`, and
`AudioDecoder` classes, `VideoFrame`-specific versions of
`CanvasRenderingContext2D.drawImage` and `createImageBitmap`, and all the
classes and interfaces required by these. There are no plans to implement image
formats, only video and audio.

It implements WebCodecs through
[libav.js](https://github.com/Yahweasel/libav.js/), which is a port of
[FFmpeg](https://ffmpeg.org/)'s library interface to WebAssembly and asm.js.

To use it, simply include libav.js then this library, and then call and `await
LibAVWebCodecs.load()`. `load` takes an optional `options` parameter, which is
an object:

```
options: {
    /* Polyfill: If the WebCodecs API is not provided by the browser in the
     * global object, link it to this library */
    polyfill?: boolean,

    /* Options to pass to LibAV.LibAV while constructing a LibAV instance */
    libavOptions?: any
}
```

Use it either by the WebCodecs API specification (if you used `polyfill`), or
as a [ponyfill](https://ponyfill.com), with the API under the global
`LibAVWebCodecs` object.

If you don't bring your own libav.js, LibAVJS-WebCodecs-Polyfill will load its
own. If you load LibAVJS-WebCodecs-Polyfill in the browser context (and not a
worker thread), it is highly recommended that you do *not* use this option,
because libav.js is designed to use Web Workers, and Web Workers cannot be
loaded from a different origin. This will hurt both performance and
responsiveness. That is, it is recommended that *either* you load libav.js
yourself, *or* you use LibAVJS-WebCodecs-Polyfill in a Worker thread (or both!).

You can use LibAVJS-WebCodecs-Polyfill along with a browser implementation of
WebCodecs, but you cannot mix and match raw data objects from each (e.g.,
`VideoFrame`s from a browser implementation of WebCodecs cannot be used in
LibAV-WebCodecs-Polyfill and vice-versa). To make this practical,
`LibAVWebCodecs.getXY(config)` (where `X` = `Video` or `Audio` and `Y` =
`Encoder` or `Decoder`) are implemented, and will return a promise for an
object with, e.g.  `VideoEncoder`, `EncodedVideoChunk`, and `VideoFrame` set to
either WebCodecs' or LibAVJS-WebCodecs-Polyfill's version. The promise is
rejected if the configuration is unsupported.

For rendering, it is highly recommended that you use
`LibAVWebCodecs.createImageBitmap` and draw the result on a canvas, rather than
`LibAVWebCodecs.canvasDrawImage`, which is synchronous.
`LibAVWebCodecs.createImageBitmap` only accepts the `resizeWidth` and
`resizeHeight` options, so only the overload
`LibAVWebCodecs.createImageBitmap(frame, options)` is supported, with `options`
optional.

If you need the synchronous API, use `LibAVWebCodecs.canvasDrawImage(ctx,
...)`. The first argument is the context, and the remaining arguments are as in
`CanvasRenderingContext2D.drawImage`. It is safe to use `canvasDrawImage` with
any image type, not just a `VideoFrame`; it will fall through to the original
`drawImage` as needed. If you used the `polyfill` option while loading
LibAVJS-WebCodecs-Polyfill, then `drawImage` itself will also support
`VideoFrame`s.


## Compatibility

LibAVJS-WebCodecs-Polyfill should be up to date with the 2024-02-08 working
draft of the WebCodecs specification:
https://www.w3.org/TR/2024/WD-webcodecs-20240208/

Video support in LibAVJS-WebCodecs-Polyfill requires libav.js 5.1.6 or later.
Audio support should work with libav.js 4.8.6 or later, but is of course usually
tested only with the latest version.

Depending on the libav.js variant used, LibAVJS-WebCodecs-Polyfill supports the
audio codecs FLAC (`"flac"`), Opus (`"opus"`), and Vorbis (`"vorbis"`), and the
video codecs AV1 (`"av01"`), VP9 (`"vp09"`), and VP8 (`"vp8"`). The
`webm-vp9` variant, which LibAVJS-WebCodecs-Polyfill uses if no libav.js is
loaded, supports FLAC, Opus, VP8, and VP9.

FFmpeg supports many codecs, and it's generally easy to add new codecs to
libav.js and LibAVJS-WebCodecs-Polyfill. However, there are no plans to add any
codecs by the Misanthropic Patent Extortion Gang (MPEG), so all useful codecs
in the WebCodecs codec registry are supported.

LibAVJS-WebCodecs-Polyfill also supports bypassing the codec registry entirely
and using any codec FFmpeg is capable of, by using the `LibAVJSCodec` interface
(see `src/libav.ts`) instead of a string for the codec. For instance,
`VideoEncoder` can be configured to use H.263+ like so:

```
const enc = new LibAVJS.VideoEncoder(...);
enc.configure({
    codec: {libavjs: {
        codec: "h263p",
        ctx: {
            pix_fmt: 0,
            width: settings.width,
            height: settings.height,
            framerate_num: settings.frameRate,
            framerate_den: 1
        }
    }},
    ...
});
```

This is useful because VP8, even in realtime mode, is really too slow to
encode/decode in software in WebAssembly on many modern systems, but a simpler
codec like H.263+ works in software nearly anywhere.


## Limitations

The `createImageBitmap` polyfill is quite limited in the arguments it accepts.

libav.js is surprisingly fast for what it is, but it ain't fast. All audio
codecs work fine, but video struggles. This is why support for codecs outside
the codec registry was added.

`VideoFrame` is fairly incomplete. In particular, nothing to do with color
spaces is actually implemented, and nor is cropping. The initialization of
frames from canvas sources has many caveats in the spec, and none in
LibAVJS-WebCodecs-Polyfill, and as a consequence, `timestamp` is always a
mandatory field of `VideoFrameInit`.

`VideoEncoder` assumes that `VideoFrame`s passed to it are fairly sane (i.e.,
the planes are lain out in the obvious way).

Certain events are supposed to eagerly halt the event queue, but
LibAVJS-WebCodecs-Polyfill always lets the event queue finish.

The framerate reported to video codecs is the nearest whole number to the input
framerate. This should usually only affect bitrate and latency calculations, as
each frame is individually timestamped.
