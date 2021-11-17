# LibAVJS-WebCodecs-Polyfill

This is a polyfill for the [WebCodecs API](https://w3c.github.io/webcodecs/).

No, really.

Right now, it supports decoding and audio encoding, but video encoding is
coming soon. Note however that there are no plans to implement image formats,
only video and audio.

It implements WebCodecs through
[libav.js](https://github.com/Yahweasel/libav.js/), which is a port of
[FFmpeg](https://ffmpeg.org/)'s library interface to WebAssembly and asm.js.

To use it, simply include libav.js then this library, and then call and `await`
`LibAVWebCodecs.load()`. `load` takes an optional `options` parameter, which is
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
own, but it is highly recommended that you do *not* use this option, because
libav.js is designed to use Web Workers, and Web Workers cannot be loaded from
a different origin.

You can use LibAVJS-WebCodecs-Polyfill along with a browser implementation of
WebCodecs, but you cannot mix and match raw data objects from each (e.g.,
`VideoFrame`s from a browser implementation of WebCodecs cannot be used in
LibAV-WebCodecs-Polyfill and vice-versa). To make this practical,
`LibAVWebCodecs.getXY(config)` (where `X` = `Video` or `Audio` and `Y` =
`Encoder` or `Decoder`) are implemented, and will return a promise for an
object with, e.g.  `VideoEncoder`, `EncodedVideoChunk`, and `VideoFrame` set to
either WebCodecs' or LibAVJS-WebCodecs-Polyfill's version.


## Compatibility

LibAVJS-WebCodecs-Polyfill should be up to date with revision `d920a2cb7`
(2021-11-10) of the WebCodecs specification.

Depending on the libav.js version used, LibAVJS-WebCodecs-Polyfill supports the
audio codecs flac, opus, and vorbis, and the video codecs vp9 and vp8. The
`webm-opus-flac` variant, which LibAVJS-WebCodecs-Polyfill uses if no libav.js
is loaded, supports flac, opus, and vp8.

FFmpeg supports many codecs, and it's generally easy to add new codecs to
libav.js and LibAVJS-WebCodecs-Polyfill. However, there are no plans to add any
codecs by the Misanthropic Patent Extortion Gang (MPEG), so the only useful
codec not presently supported is AV1.


## Limitations

Parts of the API outside of the main classes are not modified. In particular,
LibAVJS-WebCodecs-Polyfill makes no attempt to replace
`CanvasRenderingContext2D.drawImage` or otherwise give it the capability to
draw `VideoFrame`s.

libav.js is surprisingly fast for what it is, but it ain't fast. All audio
codecs work fine, but video struggles. libav.js also currently doesn't support
multithreading, so every encoder/decoder is single-threaded. But, multiple
libav.js threads can themselves be loaded, so multithreading can still be
achieved by using multiple encoders/decoders simultaneously.

`VideoFrame` is fairly incomplete. In particular, nothing to do with color
spaces is actually implemented, and nor is cropping.

`VideoEncoder` assumes that `VideoFrame`s passed to it are fairly sane (i.e.,
the planes are lain out in the obvious way).

Every time the spec specifies a `sequence`, LibAVJS-WebCodecs-Polyfill only
works with an array.

Certain events are supposed to eagerly halt the event queue, but
LibAVJS-WebCodecs-Polyfill always lets the event queue finish.
