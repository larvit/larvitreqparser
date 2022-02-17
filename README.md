[![Build Status](https://github.com/larvit/larvitreqparser/actions/workflows/node.js.yml/badge.svg)](https://github.com/larvit/larvitreqparser/actions) [![Dependencies](https://david-dm.org/larvit/larvitreqparser.svg)](https://david-dm.org/larvit/larvitreqparser.svg)

# Request parser middleware

Middleware for [larvitbase](https://github.com/larvit/larvitbase) or [express](https://expressjs.com/) to handle parsing url, forms and file uploads. This is just a wrapper for the following libraries:

* [url.parse](https://nodejs.org/api/url.html#url_url_parse_urlstring_parsequerystring_slashesdenotehost)
* Saving of request body
* [qs](https://github.com/ljharb/qs)
* [busboy](https://github.com/mscdex/busboy)

As a little bonus, it is also setting a request uuid to identify every request in logs etc.

## Installation

```shell
npm i --save larvitreqparser
```

## Usage

### Larvitbase

Usage with [larvitbase](https://github.com/larvit/larvitbase)

```javascript
const App = require('larvitbase');
const ReqParser = require('larvitreqparser');
const reqParser = new ReqParser({
	// OPTIONAL
	'fs': require('fs-extra'), // Needs some extra functions from fs-extra
	'log': new (require('larvitutils').Log(), // Compatible with the winston logging library
	'storage': 'memory', // Default. Options: 'memory' or a file path, for example '/tmp'.
	'busboyOptions': {} // Custom busboy options, see https://github.com/mscdex/busboy for options
});

new App({
	'httpOptions': 8001,
	'middleware': [
		reqParser.parse.bind(reqParser), // We must bind() the context or we'll lose it
		function (req, res) {
			// Now the following properties is populated depending on the request type:

			// req.urlParsed - URL parsed by require('url').parse()

			// Will be populated when a HTML form is posted either as multipart or as default html form.
			// req.formFields

			// Will be populated when a HTML multipart form is posted with files
			// !!! NOT when sending just a single file as body, that will only populate req.rawBody (see below)
			// req.formFiles[fieldName].filename
			// req.formFiles[fieldName].mimetype
			// req.formFiles[fieldName].encoding

			// If storage === 'memory'
			// req.rawBody
			// req.formFiles[fieldName].buffer (Only when multipart form is posted)

			// If storage is path on disk
			// req.rawBodyPath
			// req.formFiles[fieldName].path (Only when multipart form is posted)

			res.end('Hello world');
		}
	]
});
```

#### Cleanup when not using memory

When not using memory, files are stored on disk. They must be manually removed or they will just fill up infinitly!

```javascript
const App = require('larvitbase');
const ReqParser = require('larvitreqparser');
const reqParser = new ReqParser({
	'storage': '/tmp'
});
const fs = require('fs');

new App({
	'httpOptions': 8001,
	'middleware': [
		reqParser.parse,
		function (req, res, cb) {
			res.end('Hello world');
			cb();
		},
		reqParser.clean
	]
});
```

If a file should not be cleaned up for some reason a flag can be set on the formFile object to indicate manual cleanup:

```javascript
function middleware(req, res, cb) {
	req.formFiles.myFile.manualCleanup = true; // Tell larvitreqparser clean function not to remove the file

	doSomethingAsyncWithTheFile(req.formFiles.myFile, function() {
		// Manually remove the file when we are done with it
	});

	cb(); // We continue before async work on the file is completed
}
```

#### Changelog

* 0.4.7 - Added simplest possible declaration file for package to work with typescript