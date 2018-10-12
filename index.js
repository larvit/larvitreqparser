'use strict';

const topLogPrefix = 'larvitreqparser: ./index.js: ';
const EventEmitter = require('events').EventEmitter;
const Readable     = require('stream').Readable;
const uuidv4       = require('uuid/v4');
const Busboy       = require('busboy');
const LUtils       = require('larvitutils');
const async        = require('async');
const path		   = require('path');
const url          = require('url');
const qs           = require('qs');

/**
 * Main module function
 * @param {obj} options - {
 * 	log:     log object instance  - defaults to larvitutils simple logger
 * 	fs:      fs instance          - defaults to fs-extra module
 * 	storage: storage type, string - defaults to "memory"
 * }
 */
function ReqParser(options) {
	const that = this;

	that.options = options || {};

	if (! that.options.storage) {
		that.options.storage	= 'memory';
	}

	if (! that.options.log) {
		const lUtils = new LUtils();

		that.options.log = new lUtils.Log();
	}

	if (! that.options.fs) {
		that.options.fs = require('fs-extra');
	}

	if (! that.options.busboyOptions) {
		that.options.busboyOptions = {};
	}

	for (const key of Object.keys(that.options)) {
		that[key] = that.options[key];
	}
}
ReqParser.prototype.__proto__ = EventEmitter.prototype;

ReqParser.prototype.clean = function clean(req, res, cb) {
	const logPrefix = topLogPrefix + 'clean() - reqUuid: ' + req.uuid + ' - ';
	const that      = this;

	if (that.options.storage === 'memory') {
		return cb();
	}

	// Run callback first, we do not have to wait for the cleanup to be done
	cb();

	that.fs.readdir(that.storage, function (err, files) {
		if (err) {
			that.log.error(logPrefix + 'Could not read directory: "' + that.storage + '", err: ' + err.message);

			return;
		}

		for (const file of files) {
			that.fs.unlink(path.join(that.storage, file), function (err) {
				if (err) {
					that.log.error(logPrefix + 'Could not remove file "' + path.join(that.storage, file) + '", err: ' + err.message);
				}
			});
		}
	});
};

ReqParser.prototype.parse = function parse(req, res, cb) {
	const tasks = [];
	const that  = this;

	if (! req.uuid) {
		req.uuid = uuidv4();
	}
	req.reqParser = {};

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
						that.busboyOptions.headers = req.headers;
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
	const busboy = new Busboy(this.busboyOptions);
	const that   = this;

	req.formFields = {};
	req.formFiles  = {};

	busboy.on('file', function (fieldName, file, filename, encoding, mimetype) {
		const formFile = {};

		formFile.filename = filename;
		formFile.encoding = encoding;
		formFile.mimetype = mimetype;

		if (that.options.storage === 'memory') {
			formFile.buffer = [];

			file.on('data', function (data) {
				formFile.buffer.push(data);
			});
		} else {
			formFile.path        = that.storage + '/' + uuidv4();
			formFile.writeStream = that.fs.createWriteStream(formFile.path);
			file.pipe(formFile.writeStream);
			formFile.writeStream.on('finish', function () {
				formFile.writtenToDisk = true;
			});
		}

		file.on('end', function () {
			if (that.options.storage === 'memory') {
				formFile.buffer = Buffer.concat(formFile.buffer);
			}

			if (fieldName.substring(fieldName.length - 2) === '[]') {
				fieldName = fieldName.substring(0, fieldName.length - 2);
				if (! Array.isArray(req.formFiles[fieldName])) {
					req.formFiles[fieldName] = [];
				}
				req.formFiles[fieldName].push(formFile);
			} else {
				req.formFiles[fieldName] = formFile;
			}
		});
	});

	busboy.on('field', function (fieldName, fieldVal) {
		if (fieldName.substring(fieldName.length - 2) === '[]') {
			fieldName = fieldName.substring(0, fieldName.length - 2);

			if (! Array.isArray(req.formFields[fieldName])) {
				req.formFields[fieldName] = [];
			}

			req.formFields[fieldName].push(fieldVal);
		} else {
			req.formFields[fieldName] = fieldVal;
		}
	});

	busboy.on('finish', function () {
		const tasks = [];

		if (that.options.storage === 'memory') {
			return cb();
		}

		// Walk through all files and make sure they are written to disk
		for (const fieldName of Object.keys(req.formFiles)) {
			let files;

			if (Array.isArray(req.formFiles[fieldName])) {
				files = req.formFiles[fieldName];
			} else {
				files = [req.formFiles[fieldName]];
			}

			for (let i = 0; files[i] !== undefined; i ++) {
				const file = files[i];

				if (file.writtenToDisk !== true) {
					tasks.push(function (cb) {
						file.writeStream.on('finish', cb);
					});
				}
			}
		}

		async.parallel(tasks, cb);
	});

	if (that.storage === 'memory') {
		const stream = new Readable();

		stream.push(req.rawBody);
		stream.push(null);
		stream.pipe(busboy);
	} else {
		const readStream = that.fs.createReadStream(req.rawBodyPath);

		readStream.pipe(busboy);
	}
};

ReqParser.prototype.parseFormUrlEncoded = function parseFormUrlEncoded(req, cb) {
	const logPrefix = topLogPrefix + 'parseFormUrlEncoded() - reqUuid: ' + req.uuid + ' - ';
	const that      = this;

	if (! Buffer.isBuffer(req.rawBody) && ! req.rawBodyPath) {
		req.formFields = {};

		return cb();
	}

	if (that.options.storage === 'memory') {
		req.formFields = qs.parse(req.rawBody.toString());
		cb();
	} else {
		that.fs.readFile(req.rawBodyPath, function (err, content) {
			if (err) {
				that.log.error(logPrefix + 'Could not read req.rawBodyPath: "' + req.rawBodyPath + '", err: ' + err.message);

				return cb(err);
			}

			req.formFields = qs.parse(content.toString());
			cb();
		});
	}
};

ReqParser.prototype.parseUrl = function parseUrl(req, res, cb) {
	let protocol;
	let host;

	if (req.connection && req.connection.encrypted) {
		protocol = 'https';
	} else {
		protocol = 'http';
	}

	if (req.headers && req.headers.host) {
		host = req.headers.host;
	} else {
		host = 'localhost';
	}

	req.urlParsed = url.parse(protocol + '://' + host + req.url, true);
	cb();
};

ReqParser.prototype.writeRawBody = function writeRawBody(req, cb) {
	const that = this;

	if (typeof req.on === 'function') {
		if (that.storage === 'memory') {
			that.writeRawBodyToMem(req, cb);
		} else {
			that.writeRawBodyToFs(req, cb);
		}
	} else {
		cb();
	}
};

ReqParser.prototype.writeRawBodyToMem = function writeRawBodyToMem(req, cb) {
	const logPrefix = topLogPrefix + 'writeRawBodyToMem() - reqUuid: ' + req.uuid + ' - ';
	const that      = this;

	that.log.debug(logPrefix + 'Running');

	req.rawBody = [];

	req.on('data', function (chunk) {
		req.rawBody.push(chunk);
	});

	req.on('end', function () {
		if (req.rawBody.length === 0) {
			delete req.rawBody;
		} else {
			req.rawBody = Buffer.concat(req.rawBody);
		}
		cb();
	});
};

ReqParser.prototype.writeRawBodyToFs = function writeRawBodyToFs(req, cb) {
	const logPrefix = topLogPrefix + 'writeRawBodyToFs() - reqUuid: ' + req.uuid + ' - ';
	const that      = this;

	that.log.debug(logPrefix + 'Running');

	that.fs.ensureDir(that.options.storage, function (err) {
		let writeStream;

		if (err) {
			that.log.error(logPrefix + 'Can not create storage folder on disk. Path: "' + that.storage + '", err: ' + err.message);

			req.on('data', function () {
				// Do nothing, we cannot save the data anywhere
			});

			req.on('end', function () {
				cb(err);
			});

			return;
		}

		req.rawBodyPath = that.options.storage + '/' + req.uuid;

		// This opens up the writeable stream to "rawBody"
		writeStream = that.fs.createWriteStream(req.rawBodyPath);

		// This pipes the request data to the file
		req.pipe(writeStream);

		writeStream.on('finish', function () {
			// Important not to use req.on(end) here, since the write stream might not be finished yet
			that.log.debug(logPrefix + 'writeStream.on(finnish)');
			cb();
		});

		writeStream.on('error', function (err) {
			that.log.error(logPrefix + 'Can not write request body to disk. Path: "' + req.rawBodyPath + '", err: ' + err.message);
			cb(err);
		});
	});
};

exports = module.exports = ReqParser;
