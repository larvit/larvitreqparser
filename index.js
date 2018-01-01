'use strict';

const	topLogPrefix	= 'larvitreqparser: ./index.js: ',
	uuidv4	= require('uuid/v4'),
	//Busboy	= require('busboy'),
	async	= require('async'),
	url	= require('url'),
	log	= require('winston'),
	fs	= require('fs-extra');

function ReqParser(options) {
	if ( ! options) {
		options	= {};
	}

	if ( ! options.storage) {
		options.storage	= 'memory';
	}

	this.options	= options;
}

ReqParser.prototype.parse = function parse(req, res, cb) {
	const	tasks	= [],
		that	= this;

	req.uuid	= uuidv4();
	req.ended	= false;

	// Raw body
	// This must happen before the async tasks!
	that.writeRawBody(req);

	// Parse URL
	tasks.push(function (cb) {
		that.parseUrl(req, res, cb);
	});

	// Wait for req.ended
	tasks.push(function (cb) {
		if (req.ended) return cb();

		if (req.processing) {

		}

		if (typeof req.on === 'function') {
			req.on('end', cb);
		} else {
			cb();
		}
	});

	async.series(tasks, cb);
};

ReqParser.prototype.parseUrl = function parseUrl(req, res, cb) {
	let	protocol,
		host;

	if (req.connection && req.connection.encrypted) {
		protocol	= 'https';
	} else {
		protocol	= 'http';
	}

	if (req.headers && req.headers.host) {
		host	= req.headers.host;
	} else {
		host	= 'localhost';
	}

	req.urlParsed = url.parse(protocol + '://' + host + req.url, true);
	cb();
};

ReqParser.prototype.writeRawBody = function writeRawBody(req) {
	const	that	= this;

	if (typeof req.on === 'function') {
		if (that.options.storage === 'memory') {
			that.writeRawBodyToMem(req);
		} else {
			that.writeRawBodyToFs(req);
		}
	}
};

ReqParser.prototype.writeRawBodyToMem = function writeRawBodyToMem(req) {
	req.rawBody	= [];

	req.on('data', function (chunk) {
		req.rawBody.push(chunk);
	});

	req.on('end', function () {
		if (req.rawBody.length === 0) {
			delete req.rawBody;
		} else {
			req.rawBody	= Buffer.concat(req.rawBody);
		}
		req.ended	= true;
	});
};

ReqParser.prototype.writeRawBodyToFs = function writeRawBodyToFs(req) {
	const	logPrefix	= topLogPrefix + 'writeRawBodyToFs() - ',
		that	= this;

	fs.ensureDir(that.options.storage, function (err) {
		let	writeStream;

		if (err) {
			log.error(logPrefix + 'Can not create storage folder on disk. Path: "' + that.options.storage + '", err: ' + err.message);

			req.on('data', function () {
				// Do nothing, we cannot save the data anywhere
			});

			req.on('end', function () {
				req.ended	= true;
			});

			return;
		}

		req.rawBodyPath	= that.options.storage + '/' + req.uuid;

		// This opens up the writeable stream to "rawBody"
		writeStream	= fs.createWriteStream(req.rawBodyPath);
		req.processing	= true;

		// This pipes the request data to the file
		req.pipe(writeStream);

		writeStream.on('finish', function () {
			// Important not to use req.on(end) here, since the write stream might not be finished yet
			req.ended	= true;
			req.processing	= false;
		});

		writeStream.on('error', function (err) {
			log.error(logPrefix + 'Can not write request body to disk. Path: "' + req.rawBodyPath + '", err: ' + err.message);
		});
	});
};

exports = module.exports = ReqParser;
