'use strict';

/**
 * Checks if a request is parseable by formidable
 *
 * @param obj req - standard request object
 * @return boolean
 */
function formidableParseable(req) {
	// For reference this is taken from formidable/lib/incoming_form.js - IncomingForm.prototype._parseContentType definition

	if (req.method !== 'POST') {
		return false;
	}

	// Make sure to pick up content type header case insensitive
	for (const key of Object.keys(req.headers)) {
		if (key.toLowerCase() === 'content-type' && req.headers['content-type'] === undefined) {
			req.headers['content-type']	= req.headers[key];
			break;
		}
	}

	if ( ! req.headers['content-type']) {
		return false;
	}

	if (req.headers['content-type'].match(/octet-stream/i)) {
		return true;
	}

	if (req.headers['content-type'].match(/urlencoded/i)) {
		return true;
	}

	if (req.headers['content-type'].match(/multipart/i) && req.headers['content-type'].match(/boundary=(?:"([^"]+)"|([^;]+))/i)) {
		return true;
	}

	if (req.headers['content-type'].match(/json/i)) {
		return true;
	}

	// No matches
	return false;
};

exports.formidableParseable	= formidableParseable;
