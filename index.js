'use strict';

const	topLogPrefix	= 'larvitreqparser: ./index.js: ',
	EventEmitter	= require('events').EventEmitter,
	Readable	= require('stream').Readable,
	uuidv4	= require('uuid/v4'),
	Busboy	= require('busboy'),
	async	= require('async'),
	url	= require('url'),
	log	= require('winston'),
	fs	= require('fs-extra'),
	qs	= require('qs');

function ReqParser(options) {
	if ( ! options) {
		options	= {};
	}

	if ( ! options.storage) {
		options.storage	= 'memory';
	}

	this.options	= options;
}
ReqParser.prototype.__proto__ = EventEmitter.prototype;

ReqParser.prototype.clean = function clean(req, res, cb) {
	const	logPrefix	= topLogPrefix + 'clean() - reqUuid: ' + req.uuid + ' - ',
		that	= this;

	if (that.options.storage === 'memory') {
		return cb();
	}

	// Run callback first, we do not have to wait for the cleanup to be done
	cb();

	fs.remove(that.options.storage, function (err) {
		if (err) {
			log.error(logPrefix + 'Could not remove options.storage: "' + that.options.storage + '", err: ' + err.message);
		}
	});
};

ReqParser.prototype.parse = function parse(req, res, cb) {
	const	tasks	= [],
		that	= this;

	if ( ! req.uuid) {
		req.uuid	= uuidv4();
	}
	req.reqParser	= {};

	// Raw body
	tasks.push(function (cb) {
		that.writeRawBody(req, cb);
	});

	// Parse URL
	tasks.push(function (cb) {
		that.parseUrl(req, res, cb);
	});

	if (req.headers) {
		for (const headerName of Object.keys(req.headers)) {
			if (headerName.toLowerCase() === 'content-type') {
				// Handle application/x-www-form-urlencoded
				if (req.headers[headerName] === 'application/x-www-form-urlencoded') {
					tasks.push(function (cb) {
						that.parseFormUrlEncoded(req, cb);
					});
				}

				if (req.headers[headerName].substring(0, 19) === 'multipart/form-data') {
					tasks.push(function (cb) {
						if ( ! that.options.busboy) {
							that.options.busboy	= {};
						}

						that.options.busboy.headers	= req.headers;
						that.parseFormMultipart(req, cb);
					});
				}

				break;
			}
		}
	}

	async.series(tasks, cb);
};

ReqParser.prototype.parseFormMultipart = function parseFormMultipart(req, cb) {
	const	busboy	= new Busboy(this.options.busboy),
		that	= this;

	req.formFields	= {};
	req.formFiles	= {};

	busboy.on('file', function(fieldName, file, filename, encoding, mimetype) {
		const	formFile	= {};

		formFile.filename	= filename;
		formFile.encoding	= encoding;
		formFile.mimetype	= mimetype;

		if (that.options.storage === 'memory') {
			formFile.buffer	= [];

			file.on('data', function (data) {
				formFile.buffer.push(data);
			});
		} else {
			formFile.path	= that.options.storage + '/' + uuidv4();
			formFile.writeStream	= fs.createWriteStream(formFile.path);
			file.pipe(formFile.writeStream);
			formFile.writeStream.on('finish', function () {
				formFile.writtenToDisk	= true;
			});
		}

		file.on('end', function () {
			if (that.options.storage === 'memory') {
				formFile.buffer	= Buffer.concat(formFile.buffer);
			}

			if (fieldName.substring(fieldName.length - 2) === '[]') {
				fieldName	= fieldName.substring(0, fieldName.length - 2);
				if ( ! Array.isArray(req.formFiles[fieldName])) {
					req.formFiles[fieldName]	= [];
				}
				req.formFiles[fieldName].push(formFile);
			} else {
				req.formFiles[fieldName]	= formFile;
			}
		});
	});

	busboy.on('field', function(fieldName, fieldVal/*, fieldNameTruncated, fieldValTruncated, encoding, mimetype*/) {
		if (fieldName.substring(fieldName.length - 2) === '[]') {
			fieldName = fieldName.substring(0, fieldName.length - 2);

			if ( ! Array.isArray(req.formFields[fieldName])) {
				req.formFields[fieldName]	= [];
			}

			req.formFields[fieldName].push(fieldVal);
		} else {
			req.formFields[fieldName]	= fieldVal;
		}
	});

	busboy.on('finish', function () {
		const	tasks	= [];

		if (that.options.storage === 'memory') {
			return cb();
		}

		// Walk through all files and make sure they are written to disk
		for (const fieldName of Object.keys(req.formFiles)) {
			let	files;

			if (Array.isArray(req.formFiles[fieldName])) {
				files	= req.formFiles[fieldName];
			} else {
				files	= [req.formFiles[fieldName]];
			}

			for (let i = 0; files[i] !== undefined; i ++) {
				const	file	= files[i];
				if (file.writtenToDisk !== true) {
					tasks.push(function (cb) {
						file.writeStream.on('finish', cb);
					});
				}
			}
		}

		async.parallel(tasks, cb);
	});

	if (that.options.storage === 'memory') {
		const	stream	= new Readable();

		stream.push(req.rawBody);
		stream.push(null);
		stream.pipe(busboy);
	} else {
		const	readStream	= fs.createReadStream(req.rawBodyPath);

		readStream.pipe(busboy);
	}
};

ReqParser.prototype.parseFormUrlEncoded = function parseFormUrlEncoded(req, cb) {
	const	logPrefix	= topLogPrefix + 'parseFormUrlEncoded() - reqUuid: ' + req.uuid + ' - ',
		that	= this;

	if ( ! Buffer.isBuffer(req.rawBody)  && ! req.rawBodyPath) {
		req.formFields	= {};
		return cb();
	}

	if (that.options.storage === 'memory') {
		req.formFields	= qs.parse(req.rawBody.toString());
		cb();
	} else {
		fs.readFile(req.rawBodyPath, function (err, content) {
			if (err) {
				log.error(logPrefix + 'Could not read req.rawBodyPath: "' + req.rawBodyPath + '", err: ' + err.message);
				return cb(err);
			}

			req.formFields	= qs.parse(content.toString());
			cb();
		});
	}
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

	req.urlParsed	= url.parse(protocol + '://' + host + req.url, true);
	cb();
};

ReqParser.prototype.writeRawBody = function writeRawBody(req, cb) {
	const	that	= this;

	if (typeof req.on === 'function') {
		if (that.options.storage === 'memory') {
			that.writeRawBodyToMem(req, cb);
		} else {
			that.writeRawBodyToFs(req, cb);
		}
	} else {
		cb();
	}
};

ReqParser.prototype.writeRawBodyToMem = function writeRawBodyToMem(req, cb) {
	const	logPrefix	= topLogPrefix + 'writeRawBodyToMem() - reqUuid: ' + req.uuid + ' - ';

	log.debug(logPrefix + 'Running');

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
		cb();
	});
};

ReqParser.prototype.writeRawBodyToFs = function writeRawBodyToFs(req, cb) {
	const	logPrefix	= topLogPrefix + 'writeRawBodyToFs() - reqUuid: ' + req.uuid + ' - ',
		that	= this;

	log.debug(logPrefix + 'Running');

	fs.ensureDir(that.options.storage, function (err) {
		let	writeStream;

		if (err) {
			log.error(logPrefix + 'Can not create storage folder on disk. Path: "' + that.options.storage + '", err: ' + err.message);

			req.on('data', function () {
				// Do nothing, we cannot save the data anywhere
			});

			req.on('end', function () {
				cb(err);
			});

			return;
		}

		req.rawBodyPath	= that.options.storage + '/' + req.uuid;

		// This opens up the writeable stream to "rawBody"
		writeStream	= fs.createWriteStream(req.rawBodyPath);

		// This pipes the request data to the file
		req.pipe(writeStream);

		writeStream.on('finish', function () {
			// Important not to use req.on(end) here, since the write stream might not be finished yet
			log.debug(logPrefix + 'writeStream.on(finnish)');
			cb();
		});

		writeStream.on('error', function (err) {
			log.error(logPrefix + 'Can not write request body to disk. Path: "' + req.rawBodyPath + '", err: ' + err.message);
			cb(err);
		});
	});
};

exports = module.exports = ReqParser;
