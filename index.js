'use strict';

const	topLogPrefix	= 'larvit-middleware-forms: ./index.js: ',
	formidable	= requier('formidable'),
	utils	= require(__dirname + '/utils.js'),
	log	= require('winston');

function handleForms(req, res, cb) {
	const	logPrefix	= topLogPrefix + 'handleForms() - ';

	let	form;

	if ( ! utils.formidableParseable(req)) {
		return cb();
	}

	if (req.headers['content-type'].match(/x-www-form-urlencoded/i)) {
		req.formRawBody	= [];
	} else {
		req.formRawBody	= '';
	}
	req.rawBody	= [];

	form	= new formidable.IncomingForm();
	form.keepExtensions	= true;

	// Use formidable to handle files but qs to handle formdata
	form.onPart = function onPart(part) {
		// Let formidable handle all file parts
		if (part.filename) {
			form.handlePart(part);

		// Use qs to handle array-like stuff like field[a] = b becoming {'field': {'a': 'b'}}
		} else {
			if (Array.isArray(req.formRawBody)) {
				req.formRawBody	= '';
			}

			if (req.formRawBody !== '') {
				req.formRawBody += '&';
			}

			req.formRawBody += encodeURIComponent(part.name) + '=';

			part.on('data', function (data) {
				req.formRawBody += encodeURIComponent(data);
			});
			//part.on('end', function () {
			//
			//});
			part.on('error', function (err) {
				log.warn(logPrefix + 'form.onPart() err: ' + err.message);
			});
		}
	};

	// Details about concatenating the body
	// https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/#request-body

	// Save the raw body
	req.on('data', function (data) {
		// Not multipart, fetch raw body to formRawBody as well
		if (req.headers['content-type'].match(/x-www-form-urlencoded/i)) {
			req.formRawBody.push(data);
		}

		req.rawBody.push(data);
	});

	req.on('end', function () {
		try {
			if (Array.isArray(req.formRawBody)) {
				req.formRawBody	= Buffer.concat(req.formRawBody).toString();
			}

			req.rawBody	= Buffer.concat(req.rawBody).toString();
		} catch (err) {
			log.error(logPrefix + 'Could not Buffer.concat() body parts. This is probably because of nodes string size limitation. err: ' + err.message);
		}
	});

	// When the callback to form.parse() is ran, all body is received
	form.parse(req, function (err, fields, files) {
		if (err) {
			log.warn(logPrefix + err.message);
		} else {
			req.formFields	= qs.parse(req.formRawBody, { 'parameterLimit': 10000});
			req.formFiles	= files;
		}
		cb();
	});
}

exports = module.exports = handleForms;
