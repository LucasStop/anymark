import { convertForm, type ConvertState } from '../../../lib/convert';

export const runtime = 'nodejs';

// One JSON object per line: `progress` events while the library works, then exactly one `result`.
export async function POST(request: Request) {
  const form = await request.formData();
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const state: ConvertState = await convertForm(form, ({ stage, current, total }) =>
        send({ type: 'progress', stage, current, total }),
      );
      send({ type: 'result', state });
      controller.close();
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
}
