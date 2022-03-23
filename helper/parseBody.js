import zlib from 'zlib';
import querystring from 'querystring';

import getStream, { MaxBufferError } from 'get-stream';
import httpError from 'http-errors';
import contentType from 'content-type';


export async function parseBody(req) {
  const { body } = req;

  if (typeof body === 'object' && !(body instanceof Buffer)) {
    return body;
  }

  if (req.headers['content-type'] === undefined) {
    return {};
  }

  const typeInfo = contentType.parse(req);

  if (typeof body === 'string' && typeInfo.type === 'application/graphql') {
    return { query: body };
  }

  if (body != null) {
    return {};
  }

  const rawBody = await readBody(req, typeInfo);

  switch (typeInfo.type) {
    case 'application/graphql':
      return { query: rawBody };
    case 'application/json':
      if (jsonObjRegex.test(rawBody)) {
        try {
          return JSON.parse(rawBody);
        } catch {
        }
      }
      throw httpError(400, 'POST body sent invalid JSON.');
    case 'application/x-www-form-urlencoded':
      return querystring.parse(rawBody);
  }

  return {};
}

const jsonObjRegex = /^[ \t\n\r]*\{/;

async function readBody(req, typeInfo) {
  const charset = typeInfo.parameters.charset?.toLowerCase() ?? 'utf-8';

  if (charset !== 'utf8' && charset !== 'utf-8' && charset !== 'utf16le') {
    throw httpError(415, `Unsupported charset "${charset.toUpperCase()}".`);
  }

  const contentEncoding = req.headers['content-encoding'];
  const encoding =
    typeof contentEncoding === 'string'
      ? contentEncoding.toLowerCase()
      : 'identity';
  const maxBuffer = 100 * 1024; // 100kb
  const stream = decompressed(req, encoding);

  try {
    const buffer = await getStream.buffer(stream, { maxBuffer });
    return buffer.toString(charset);
  } catch (rawError) {
    if (rawError instanceof MaxBufferError) {
      throw httpError(413, 'Invalid body: request entity too large.');
    } else {
      const message =
        rawError instanceof Error ? rawError.message : String(rawError);
      throw httpError(400, `Invalid body: ${message}.`);
    }
  }
}

function decompressed(req, encoding) {
  switch (encoding) {
    case 'identity':
      return req;
    case 'deflate':
      return req.pipe(zlib.createInflate());
    case 'gzip':
      return req.pipe(zlib.createGunzip());
  }
  throw httpError(415, `Unsupported content-encoding "${encoding}".`);
}
