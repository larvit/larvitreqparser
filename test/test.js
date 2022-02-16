'use strict';

const ReqParser = require(__dirname + '/../index.js');
const FormData = require('form-data');
const { Log } = require('larvitutils');
const uuidLib = require('uuid');
const tmpDir = require('os').tmpdir();
const axios = require('axios').default;
const test = require('tape');
const http = require('http');
const fs = require('fs-extra');


const log = new Log('none');

/* eslint-disable require-jsdoc */

function startServer(reqParser, reqHandler, cb) {
	const server = http.createServer((req, res) => {
		reqParser.parse(req, res, err => {
			req.err = err;
			reqHandler(req, res);
		});
	});

	server.listen(0, err => {
		cb(err, server);
	});
}

test('GET Http request, no body, no passed log instance', t => {
	const reqParser = new ReqParser();

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(req.urlParsed.protocol, 'http:', 'Protocol should be "http"');
		t.equal(req.urlParsed.pathname, '/foo', 'pathname should be "/foo"');
		t.equal(req.urlParsed.query.bar, 'baz', 'query.bar should be "baz"');
		t.equal(req.urlParsed.search, '?bar=baz', 'search should be "?bar=baz"');
		t.equal(req.urlParsed.hostname, '127.0.0.1', 'hostname should be "127.0.0.1"');
		t.equal(String(req.urlParsed.port), String(port), 'port should be same as the server was started on');

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		axios('http://127.0.0.1:' + port + '/foo?bar=baz');
	});
});

test('GET Https request, no host, no body', t => {
	const reqParser = new ReqParser({ log });
	const req = {};
	const res = {};

	req.url = '/foo?bar=baz';
	req.connection = {};
	req.connection.encrypted = true;
	req.uuid = 'test';

	reqParser.parse(req, res, err => {
		if (err) throw err;

		t.equal(req.urlParsed.protocol, 'https:', 'Protocol should be "https"');
		t.equal(req.urlParsed.pathname, '/foo', 'pathname should be "/foo"');
		t.equal(req.urlParsed.query.bar, 'baz', 'query.bar should be "baz"');
		t.equal(req.urlParsed.search, '?bar=baz', 'search should be "?bar=baz"');
		t.equal(req.urlParsed.hostname, 'localhost', 'hostname should be "localhost"');
		t.equal(req.urlParsed.port, null, 'port should be null');
		t.equal(req.uuid, 'test', 'uuid should be "test"');

		t.end();
	});
});

test('Test urlParsed on X-Forwarded-Proto', t => {
	const reqParser = new ReqParser({ log });
	const req = {};
	const res = {};

	req.url = '/foo?bar=baz';
	req.connection = {};
	req.connection.encrypted = false; // This should be overruled by X-Forwarded-Proto header
	req.headers = { 'X-Forwarded-Proto': 'https' };
	req.uuid = 'test';

	reqParser.parse(req, res, err => {
		if (err) throw err;

		t.equal(req.urlParsed.protocol, 'https:', 'Protocol should be "https"');
		t.equal(req.urlParsed.pathname, '/foo', 'pathname should be "/foo"');
		t.equal(req.urlParsed.query.bar, 'baz', 'query.bar should be "baz"');
		t.equal(req.urlParsed.search, '?bar=baz', 'search should be "?bar=baz"');
		t.equal(req.urlParsed.hostname, 'localhost', 'hostname should be "localhost"');
		t.equal(req.urlParsed.port, null, 'port should be null');
		t.equal(req.uuid, 'test', 'uuid should be "test"');

		t.end();
	});
});

test('POST, raw body, memory storage', t => {
	const reqParser = new ReqParser({ log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(req.rawBody.toString('hex'), Buffer.from('foobar').toString('hex'), 'rawBody should be "foobar"');

		reqParser.clean(req, res, () => t.end());
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		axios({
			url: 'http://127.0.0.1:' + port + '/',
			data: 'foobar',
		});
	});
});

test('POST, raw body, fs storage', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			fs.readFileSync(req.rawBodyPath).toString('hex'),
			Buffer.from('foobar').toString('hex'),
			'When reading the file contents from rawBodyPath it should be "foobar"',
		);

		fs.remove(storagePath);

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		axios({
			method: 'POST',
			url: 'http://127.0.0.1:' + port + '/',
			data: 'foobar',
		});
	});
});

test('POST, raw body, custom fs storage and busboy options', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({
		storage: storagePath,
		log,
		fs: require('fs-extra'),
		busboyOptions: { defCharset: 'utf8' },
	});

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			fs.readFileSync(req.rawBodyPath).toString('hex'),
			Buffer.from('foobar').toString('hex'),
			'rawBodyPath should be "foobar" here too',
		);

		fs.remove(storagePath);

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		axios({
			method: 'POST',
			url: 'http://127.0.0.1:' + port + '/',
			data: 'foobar',
		});
	});
});

test('POST, raw body, fs storage, invalid path', t => {
	const storagePath = '/no_access';
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(req.rawBodyPath, undefined, 'rawBodyPath should be undefined');
		t.equal(req.err instanceof Error, true, 'req.err should be an Error');

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		axios({
			method: 'POST',
			url: 'http://127.0.0.1:' + port + '/',
			data: 'foobar',
		});
	});
});

test('POST, application/x-www-form-urlencoded, memory storage', t => {
	const reqParser = new ReqParser({ log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			req.rawBody.toString(),
			'foo=bar&beng+tops=arr&beng+tops=ay&beng+tops=%C3%B6ber+alles+%26+%C3%A4nnu+mer',
			'rawBody should be the raw form content',
		);
		t.equal(
			JSON.stringify(req.formFields),
			'{"foo":"bar","beng tops":["arr","ay","öber alles & ännu mer"]}',
			'req.formFields should be a nice stringifyed JSON of the form data',
		);

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		const formData = new URLSearchParams();
		formData.append('foo', 'bar');
		formData.append('beng tops', 'arr');
		formData.append('beng tops', 'ay');
		formData.append('beng tops', 'öber alles & ännu mer');
		axios.post('http://127.0.0.1:' + port + '/', formData);
	});
});

test('POST, application/x-www-form-urlencoded, fs storage', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			fs.readFileSync(req.rawBodyPath).toString(),
			'foo=bar&beng+tops=arr&beng+tops=ay&beng+tops=%C3%B6ber+alles+%26+%C3%A4nnu+mer',
			'rawBody should be the raw form content',
		);
		t.equal(
			JSON.stringify(req.formFields),
			'{"foo":"bar","beng tops":["arr","ay","öber alles & ännu mer"]}',
			'req.formFields should be a nice stringifyed JSON of the form data',
		);

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		const formData = new URLSearchParams();
		formData.append('foo', 'bar');
		formData.append('beng tops', 'arr');
		formData.append('beng tops', 'ay');
		formData.append('beng tops', 'öber alles & ännu mer');
		axios.post('http://127.0.0.1:' + port + '/', formData);
	});
});

test('POST, application/x-www-form-urlencoded, fs storage parameterLimit: 6', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, qsParseOptions: { parameterLimit: 6 }, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			fs.readFileSync(req.rawBodyPath).toString(),
			'foo=bar&beng+tops=arr&beng+tops=ay&beng+tops=%C3%B6ber+alles+%26+%C3%A4nnu+mer&testar=jaha&testar=nehe&testar=ojd%C3%A5',
			'rawBody should be the raw form content',
		);
		t.equal(
			JSON.stringify(req.formFields),
			'{"foo":"bar","beng tops":["arr","ay","öber alles & ännu mer"],"testar":["jaha","nehe"]}', // ,"ojdå" missing due to parameterLimit: 6.
			'req.formFields should be a nice stringifyed JSON of the form data',
		);

		t.end();
	}, (err, result) => {
		if (err) throw err;
		server = result;
		port = server.address().port;
		const formData = new URLSearchParams();
		formData.append('foo', 'bar');
		formData.append('beng tops', 'arr');
		formData.append('beng tops', 'ay');
		formData.append('beng tops', 'öber alles & ännu mer');
		formData.append('testar', 'jaha');
		formData.append('testar', 'nehe');
		formData.append('testar', 'ojdå');
		axios.post('http://127.0.0.1:' + port + '/', formData);
	});
});

test('POST, multipart/form-data, memory storage', t => {
	const reqParser = new ReqParser({ log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			JSON.stringify(req.formFields),
			'{"foo":"bar","ove":["första ove"],"beng tops":"öber alles & ännu mer","untz":{"firstname":"kalle","lastname":{"first":"benktsson","second":"lurresson"}}}',
			'Check so req.formFields is an object with the right content',
		);
		t.equal(req.formFiles.enLitenBuffer.buffer.toString(), 'foo feng fall', 'Content of enLitenBufer should be "foo feng fall"');
		t.equal(req.formFiles.arrWithBuffers[0].buffer.toString(), 'apa', 'First part of buffer array should be "apa"');
		t.equal(req.formFiles.arrWithBuffers[1].buffer.toString(), 'bengbison', 'Second part of buffer should be "bengbison"');
		t.equal(req.formFiles.customFile.buffer.toString(), 'skruppelräv', 'customFile content should be "skruppelräv"');
		t.equal(req.formFiles.customFile.filename, 'reven.txt', 'Filename should be "reven.txt"');
		t.equal(req.formFiles.customFile.mimetype, 'text/plain', 'mimetype should be "text/plain"');

		t.end();
	}, (err, result) => {
		if (err) throw err;

		server = result;
		port = server.address().port;

		const formData = new FormData();
		formData.append('foo', 'bar');
		formData.append('ove[]', 'första ove');
		formData.append('beng tops', 'öber alles & ännu mer');
		formData.append('untz[firstname]', 'kalle');
		formData.append('untz[lastname][first]', 'benktsson');
		formData.append('untz[lastname][second]', 'lurresson');
		formData.append('enLitenBuffer', Buffer.from('foo feng fall'));
		formData.append('arrWithBuffers[]', Buffer.from('apa'));
		formData.append('arrWithBuffers[]', Buffer.from('bengbison'));
		formData.append('customFile', Buffer.from('skruppelräv'), {
			filename: 'reven.txt',
			contentType: 'text/plain',
		});

		axios.post('http://127.0.0.1:' + port + '/', formData, { headers: formData.getHeaders() });
	});
});

test('POST, multipart/form-data, fs storage', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(
			JSON.stringify(req.formFields),
			'{"foo":"bar","ove":["första ove"],"beng tops":"öber alles & ännu mer"}',
			'req.formFields should be a valid object with the right content',
		);
		t.equal(fs.readFileSync(req.formFiles.enLitenBuffer.path).toString(), 'foo feng fall', 'Content of enLitenBufer should be "foo feng fall"');
		t.equal(fs.readFileSync(req.formFiles.arrWithBuffers[0].path).toString(), 'apa', 'First part of buffer array should be "apa"');
		t.equal(fs.readFileSync(req.formFiles.arrWithBuffers[1].path).toString(), 'bengbison', 'Second part of buffer should be "bengbison"');
		t.equal(fs.readFileSync(req.formFiles.customFile.path).toString(), 'skruppelräv', 'customFile.path should be "skruppelräv"');
		t.equal(req.formFiles.customFile.filename, 'reven.txt', 'formFiles.customFile.filename should be "reven.txt"');
		t.equal(req.formFiles.customFile.mimetype, 'text/plain', 'formFiles.customFile.mimetype should be "text/plain"');

		reqParser.clean(req, res, err => {
			if (err) throw err;

			setTimeout(() => {
				t.equal(fs.existsSync(storagePath), true, 'storagePath should exist');
				t.equal(fs.readdirSync(storagePath).length, 0, 'storagePath should be empty');

				t.end();
			}, 50);
		});
	}, (err, result) => {
		if (err) throw err;

		server = result;
		port = server.address().port;

		const formData = new FormData();
		formData.append('foo', 'bar');
		formData.append('ove[]', 'första ove');
		formData.append('beng tops', 'öber alles & ännu mer');
		formData.append('enLitenBuffer', Buffer.from('foo feng fall'));
		formData.append('arrWithBuffers[]', Buffer.from('apa'));
		formData.append('arrWithBuffers[]', Buffer.from('bengbison'));
		formData.append('customFile', Buffer.from('skruppelräv'), {
			filename: 'reven.txt',
			contentType: 'text/plain',
		});

		axios.post('http://127.0.0.1:' + port + '/', formData, { headers: formData.getHeaders() });
	});
});

test('POST, empty form should not crasch application', t => {
	const reqParser = new ReqParser({ log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equals(JSON.stringify(req.formFields), '{}', 'req.formFields should be an empty object');
		t.end();
	}, (err, result) => {
		if (err) throw err;

		server = result;
		port = server.address().port;

		axios({
			method: 'POST',
			url: 'http://127.0.0.1:' + port + '/',
			data: undefined,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});
	});
});

test('clean will remove temporary form files', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(fs.existsSync(req.formFiles.arrWithBuffers[0].path), true, 'req.formFiles.arrWithBuffers[0].path should exist');
		t.equal(fs.existsSync(req.formFiles.arrWithBuffers[1].path), true, 'req.formFiles.arrWithBuffers[1].path should exist');
		t.equal(fs.existsSync(req.formFiles.customFile.path), true, 'req.formFiles.customFile.path should exist');
		t.equal(fs.existsSync(req.formFiles.manuallyCleanedUp.path), true, 'req.formFiles.manuallyCleanedUp.path should exist');

		// Set file to manually removed
		req.formFiles.manuallyCleanedUp.manualCleanup = true;

		reqParser.clean(req, res, err => {
			if (err) throw err;

			setTimeout(() => {
				t.equal(fs.existsSync(req.formFiles.arrWithBuffers[0].path), false, 'req.formFiles.arrWithBuffers[0].path should now be gone');
				t.equal(fs.existsSync(req.formFiles.arrWithBuffers[1].path), false, 'req.formFiles.arrWithBuffers[1].path should now be gone');
				t.equal(fs.existsSync(req.formFiles.customFile.path), false, 'req.formFiles.customFile.path should now be gone');
				t.equal(fs.existsSync(req.formFiles.manuallyCleanedUp.path), true, 'req.formFiles.manuallyCleanedUp.path should still exist');
				t.end();
			}, 50);
		});
	}, (err, result) => {
		if (err) throw err;

		server = result;
		port = server.address().port;

		const formData = new FormData();
		formData.append('customFile', Buffer.from('skruppelräv'), {
			filename: 'reven.txt',
			contentType: 'text/plain',
		});
		formData.append('manuallyCleanedUp', Buffer.from('nissepisse'), {
			filename: 'nisse.txt',
			contentType: 'text/plain',
		});

		formData.append('arrWithBuffers[]', Buffer.from('apa'));
		formData.append('arrWithBuffers[]', Buffer.from('bengbison'));

		axios.post('http://127.0.0.1:' + port + '/', formData, { headers: formData.getHeaders() });
	});
});

test('clean will remove temporary raw body file', t => {
	const storagePath = tmpDir + '/' + uuidLib.v4();
	const reqParser = new ReqParser({ storage: storagePath, log });

	let server;
	let port;

	startServer(reqParser, (req, res) => {
		if (req.err) throw req.err;
		res.end();
		server.close(err => {
			if (err) throw err;
		});

		t.equal(fs.existsSync(req.rawBodyPath), true, 'rawBodyPath should exist in the filesystem when we start');

		reqParser.clean(req, res, err => {
			if (err) throw err;

			setTimeout(() => {
				t.equal(fs.existsSync(req.rawBodyPath), false, 'now rawBodyPath should be gone');
				t.end();
			}, 50);
		});
	}, (err, result) => {
		const formData = {};

		if (err) throw err;

		server = result;
		port = server.address().port;

		formData.foo = 'bar';

		axios({
			url: 'http://127.0.0.1:' + port + '/',
			formData: formData,
		});
	});
});
