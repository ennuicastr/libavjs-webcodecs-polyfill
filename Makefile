all: libavjs-webcodecs-polyfill.min.js

libavjs-webcodecs-polyfill.min.js: src/*.ts node_modules/.bin/browserify
	./src/build.js -m > $@

node_modules/.bin/browserify:
	npm install

clean:
	rm -f libavjs-webcodecs-polyfill.min.js
