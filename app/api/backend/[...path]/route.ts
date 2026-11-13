
import { NextRequest, NextResponse } from 'next/server';

const backendApi = process.env.PHP_API_URL;
const apiKey = process.env.PHP_API_SECRET_KEY;

type Context = {
  params: Promise<{ path: string[] }>;
};

async function handler(
  req: NextRequest,
  { params }: Context
) {
  if (!backendApi || !apiKey) {
    return NextResponse.json(
      { error: 'API proxy is not configured' },
      { status: 503 }
    );
  }

  const { path } = await params;

  // Build PHP API URL
  const target = new URL(
    `${backendApi.replace(/\/$/, '')}/${path
      .map(encodeURIComponent)
      .join('/')}`
  );

  target.search = req.nextUrl.search;

  // Build request headers
  const headers = new Headers();

  headers.set('X-API-Key', apiKey);

  const authorization = req.headers.get('authorization');

  if (authorization) {
    headers.set('Authorization', authorization);
  }

  const contentType = req.headers.get('content-type');

  if (contentType) {
    // Keep the original multipart boundary or JSON type
    headers.set('Content-Type', contentType);
  }

  const accept = req.headers.get('accept');

  if (accept) {
    headers.set('Accept', accept);
  }

  try {
    // Forward raw body (JSON or multipart/form-data)
    const body = ['GET', 'HEAD'].includes(req.method)
      ? undefined
      : await req.arrayBuffer();

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
      redirect: 'manual'
    });

    const responseBody = await upstream.arrayBuffer();

    const responseHeaders = new Headers();

    responseHeaders.set(
      'Content-Type',
      upstream.headers.get('content-type') ||
        'application/octet-stream'
    );

    responseHeaders.set('Cache-Control', 'no-store');

    // Return the exact PHP API response
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders
    });
  } catch (error) {
    console.error('PiklVenue API proxy error:', error);

    return NextResponse.json(
      { error: 'Unable to connect to PHP backend' },
      { status: 502 }
    );
  }
}

export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE
};
