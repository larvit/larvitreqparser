'use strict';

const ReqParser = require(__dirname + '/../index.js');
const request = require('request');
const uuidv4 = require('uuid/v4');
const tmpDir = require('os').tmpdir();
const LUtils = require('larvitutils');
const test = require('tape');
const http = require('http');
const log = new (new LUtils()).Log('nej');
const fs = require('fs-extra');

/* eslint-disable require-jsdoc */

function startServer(reqParser, reqHandler, cb) {
	const server = http.createServer(function (req, res) {
		reqParser.parse(req, res, function (err) {
			req.err = err;
			reqHandler(req, res);
		});
	});

	server.listen(0, function (err) {
		cb(err, server);
	});
}

test('GET Http request, no body, no passed log instance', function (t) {
	const reqParser = new ReqParser();

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(req.urlParsed.protocol, 'http:');
		t.equal(req.urlParsed.pathname, '/foo');
		t.equal(req.urlParsed.query.bar, 'baz');
		t.equal(req.urlParsed.search, '?bar=baz');
		t.equal(req.urlParsed.hostname, '127.0.0.1');
		t.equal(String(req.urlParsed.port), String(port));

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request('http://127.0.0.1:' + port + '/foo?bar=baz');
	});
});

test('GET Https request, no host, no body', function (t) {
	const reqParser = new ReqParser({'log': log});
	const req = {};
	const res = {};

	req.url = '/foo?bar=baz';
	req.connection = {};
	req.connection.encrypted = true;
	req.uuid = 'test';

	reqParser.parse(req, res, function (err) {
		if (err) throw err;

		t.equal(req.urlParsed.protocol,  'https:');
		t.equal(req.urlParsed.pathname,  '/foo');
		t.equal(req.urlParsed.query.bar, 'baz');
		t.equal(req.urlParsed.search,    '?bar=baz');
		t.equal(req.urlParsed.hostname,  'localhost');
		t.equal(req.urlParsed.port,      null);
		t.equal(req.uuid,                'test');

		t.end();
	});
});

test('POST, raw body, memory storage', function (t) {
	const reqParser = new ReqParser({'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(req.rawBody.toString('hex'), Buffer.from('foobar').toString('hex'));

		reqParser.clean(req, res, function () {
			t.end();
		});
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'body': 'foobar'
		});
	});
});

test('POST, raw body, fs storage', function (t) {
	const storagePath = tmpDir + '/' + uuidv4();
	const reqParser = new ReqParser({'storage': storagePath, 'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(fs.readFileSync(req.rawBodyPath).toString('hex'),	Buffer.from('foobar').toString('hex'));

		fs.remove(storagePath);

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'body': 'foobar'
		});
	});
});

test('POST, raw body, custom fs storage and busboy options', function (t) {
	const storagePath = tmpDir + '/' + uuidv4();
	const reqParser = new ReqParser({
		'storage': storagePath,
		'log': log,
		'fs': require('fs-extra'),
		'busboyOptions': {'defCharset': 'utf8'}
	});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(fs.readFileSync(req.rawBodyPath).toString('hex'),	Buffer.from('foobar').toString('hex'));

		fs.remove(storagePath);

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'body': 'foobar'
		});
	});
});

test('POST, raw body, fs storage, invalid path', function (t) {
	const storagePath = '/no_access';
	const reqParser = new ReqParser({'storage': storagePath, 'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(req.rawBodyPath, undefined);
		t.equal(req.err instanceof Error, true);

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'body': 'foobar'
		});
	});
});

test('POST, application/x-www-form-urlencoded, memory storage', function (t) {
	const reqParser = new ReqParser({'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(req.rawBody.toString(), 'foo=bar&beng%20tops%5B0%5D=arr&beng%20tops%5B1%5D=ay&beng%20tops%5B2%5D=%C3%B6ber%20alles%20%26%20%C3%A4nnu%20mer');
		t.equal(JSON.stringify(req.formFields), '{"foo":"bar","beng tops":["arr","ay","öber alles & ännu mer"]}');

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'form': {
				'foo': 'bar',
				'beng tops': [
					'arr',
					'ay',
					'öber alles & ännu mer'
				]
			}
		});
	});
});

test('POST, application/x-www-form-urlencoded, fs storage', function (t) {
	const storagePath = tmpDir + '/' + uuidv4();
	const reqParser = new ReqParser({'storage': storagePath, 'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(fs.readFileSync(req.rawBodyPath).toString(), 'foo=bar&beng%20tops%5B0%5D=arr&beng%20tops%5B1%5D=ay&beng%20tops%5B2%5D=%C3%B6ber%20alles%20%26%20%C3%A4nnu%20mer');
		t.equal(JSON.stringify(req.formFields), '{"foo":"bar","beng tops":["arr","ay","öber alles & ännu mer"]}');

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server = result;
		port = server.address().port;
		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'form': {
				'foo': 'bar',
				'beng tops': [
					'arr',
					'ay',
					'öber alles & ännu mer'
				]
			}
		});
	});
});

test('POST, multipart/form-data, memory storage', function (t) {
	const reqParser = new ReqParser({'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(JSON.stringify(req.formFields), '{"foo":"bar","ove":["första ove"],"beng tops":"öber alles & ännu mer","untz":{"firstname":"kalle","lastname":{"first":"benktsson","second":"lurresson"}}}');
		t.equal(req.formFiles.enLitenBuffer.buffer.toString(), 'foo feng fall');
		t.equal(req.formFiles.arrWithBuffers[0].buffer.toString(), 'apa');
		t.equal(req.formFiles.arrWithBuffers[1].buffer.toString(), 'bengbison');
		t.equal(req.formFiles.customFile.buffer.toString(), 'skruppelräv');
		t.equal(req.formFiles.customFile.filename, 'reven.txt');
		t.equal(req.formFiles.customFile.mimetype, 'text/plain');

		t.end();
	}, function (err, result) {
		const formData = {};

		if (err) throw err;

		server = result;
		port = server.address().port;

		formData.foo = 'bar';
		formData['ove[]'] = 'första ove';
		formData['beng tops'] = 'öber alles & ännu mer';
		formData['untz[firstname]'] = 'kalle';
		formData['untz[lastname][first]'] = 'benktsson';
		formData['untz[lastname][second]'] = 'lurresson';
		formData.enLitenBuffer = Buffer.from('foo feng fall');
		formData['arrWithBuffers[]'] = [
			Buffer.from('apa'),
			Buffer.from('bengbison')
		];
		formData.customFile = {
			'value': Buffer.from('skruppelräv'),
			'options': {
				'filename': 'reven.txt',
				'contentType': 'text/plain'
			}
		};

		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'formData': formData
		});
	});
});

test('POST, multipart/form-data, fs storage', function (t) {
	const storagePath = tmpDir + '/' + uuidv4();
	const reqParser = new ReqParser({'storage': storagePath, 'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equal(JSON.stringify(req.formFields), '{"foo":"bar","ove":["första ove"],"beng tops":"öber alles & ännu mer"}');
		t.equal(fs.readFileSync(req.formFiles.enLitenBuffer.path).toString(), 'foo feng fall');
		t.equal(fs.readFileSync(req.formFiles.arrWithBuffers[0].path).toString(), 'apa');
		t.equal(fs.readFileSync(req.formFiles.arrWithBuffers[1].path).toString(), 'bengbison');
		t.equal(fs.readFileSync(req.formFiles.customFile.path).toString(), 'skruppelräv');
		t.equal(req.formFiles.customFile.filename, 'reven.txt');
		t.equal(req.formFiles.customFile.mimetype, 'text/plain');

		reqParser.clean(req, res, function (err) {
			if (err) throw err;

			setTimeout(function () {
				t.equal(fs.existsSync(storagePath), true);
				t.equal(fs.readdirSync(storagePath).length, 0);

				t.end();
			}, 50);
		});
	}, function (err, result) {
		const formData = {};

		if (err) throw err;

		server = result;
		port   = server.address().port;

		formData.foo = 'bar';
		formData['ove[]'] = 'första ove';
		formData['beng tops'] = 'öber alles & ännu mer';
		formData.enLitenBuffer = Buffer.from('foo feng fall');
		formData['arrWithBuffers[]'] = [
			Buffer.from('apa'),
			Buffer.from('bengbison')
		];
		formData.customFile = {
			'value': Buffer.from('skruppelräv'),
			'options': {
				'filename': 'reven.txt',
				'contentType': 'text/plain'
			}
		};

		request({
			'url': 'http://127.0.0.1:' + port + '/',
			'formData': formData
		});
	});
});

test('POST, empty form should not crasch application', function (t) {
	const reqParser = new ReqParser({'log': log});

	let server;
	let port;

	startServer(reqParser, function (req, res) {
		if (req.err) throw req.err;
		res.end();
		server.close(function (err) {
			if (err) throw err;
		});

		t.equals(JSON.stringify(req.formFields), '{}');
		t.end();
	}, function (err, result) {
		if (err) throw err;

		server = result;
		port = server.address().port;

		request.post({
			'url': 'http://127.0.0.1:' + port + '/',
			'headers': {
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			'body': undefined
		});
	});
});
