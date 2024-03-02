all: node_modules/.bin/tsc
	npm run build

node_modules/.bin/tsc:
	npm install

clean:
	npm run clean
