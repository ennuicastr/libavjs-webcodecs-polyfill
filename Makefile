all: dist/libavjs-webcodecs-polyfill.min.js

dist/libavjs-webcodecs-polyfill.min.js: src/*.ts node_modules/.bin/tsc
	npm run build

node_modules/.bin/tsc:
	npm install

clean:
	npm run clean
