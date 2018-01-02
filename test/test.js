'use strict';

const	ReqParser	= require(__dirname + '/../index.js'),
	request	= require('request'),
	uuidv4	= require('uuid/v4'),
	tmpDir	= require('os').tmpdir(),
	test	= require('tape'),
	http	= require('http'),
	log	= require('winston'),
	fs	= require('fs-extra');

// Set up winston
log.remove(log.transports.Console);
/**/log.add(log.transports.Console, {
	'level':	'debug',
	'colorize':	true,
	'timestamp':	true,
	'json':	false
}); /**/

function startServer(reqParser, reqHandler, cb) {
	const server = http.createServer(function (req, res) {
		reqParser.parse(req, res, function (err) {
			if (err) throw err;
			reqHandler(req, res);
		});
	});

	server.listen(0, function (err) {
		cb(err, server);
	});
}

test('GET Http request, no body', function (t) {
	const	reqParser	= new ReqParser();

	let	server,
		port;

	startServer(reqParser, function (req, res) {
		res.end();
		server.close(function (err) { if (err) throw err; });

		t.equal(req.urlParsed.protocol,	'http:');
		t.equal(req.urlParsed.pathname,	'/foo');
		t.equal(req.urlParsed.query.bar,	'baz');
		t.equal(req.urlParsed.search,	'?bar=baz');
		t.equal(req.urlParsed.hostname,	'127.0.0.1');
		t.equal(String(req.urlParsed.port),	String(port));

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server	= result;
		port	= server.address().port;
		request('http://127.0.0.1:' + port + '/foo?bar=baz');
	});
});

test('GET Https request, no host, no body', function (t) {
	const	reqParser	= new ReqParser(),
		req	= {},
		res	= {};

	req.url	= '/foo?bar=baz';
	req.connection	= {};
	req.connection.encrypted	= true;

	reqParser.parse(req, res, function (err) {
		if (err) throw err;

		t.equal(req.urlParsed.protocol,	'https:');
		t.equal(req.urlParsed.pathname,	'/foo');
		t.equal(req.urlParsed.query.bar,	'baz');
		t.equal(req.urlParsed.search,	'?bar=baz');
		t.equal(req.urlParsed.hostname,	'localhost');
		t.equal(req.urlParsed.port,	null);

		t.end();
	});
});

test('POST request, raw body, memory storage', function (t) {
	const	reqParser	= new ReqParser();

	let	server,
		port;

	startServer(reqParser, function (req, res) {
		res.end();
		server.close(function (err) { if (err) throw err; });

		t.equal(req.rawBody.toString('hex'),	Buffer.from('foobar').toString('hex'));

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server	= result;
		port	= server.address().port;
		request({
			'url':	'http://127.0.0.1:' + port + '/',
			'body':	'foobar'
		});
	});
});

test('POST request, raw body, fs storage', function (t) {
	const	storagePath	= tmpDir + '/' + uuidv4(),
		reqParser	= new ReqParser({'storage': storagePath});

	let	server,
		port;

	startServer(reqParser, function (req, res) {
		res.end();
		server.close(function (err) { if (err) throw err; });

		t.equal(fs.readFileSync(req.rawBodyPath).toString('hex'),	Buffer.from('foobar').toString('hex'));

		fs.remove(storagePath);

		t.end();
	}, function (err, result) {
		if (err) throw err;
		server	= result;
		port	= server.address().port;
		request({
			'url':	'http://127.0.0.1:' + port + '/',
			'body':	'foobar'
		});
	});
});
