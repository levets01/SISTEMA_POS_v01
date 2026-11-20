import { api, z } from '@puesto/shared'
export function specification(version: string) {
  const paths: Record<string, Record<string, unknown>> = {}
  const error = {
    type: 'object',
    required: ['error', 'code'],
    properties: { error: { type: 'string' }, code: { type: 'string' } },
  }
  for (const [operationId, r] of Object.entries(api)) {
    const input = z.toJSONSchema(r.input, { io: 'input', unrepresentable: 'any' })
    const output = z.toJSONSchema(r.output, { unrepresentable: 'any' })
    const errors = Object.fromEntries(
      [
        [400, 'Entrada inválida'],
        [401, 'Sesión requerida'],
        [403, 'Permiso insuficiente'],
        [404, 'No encontrado'],
        [409, 'Conflicto de negocio o reintento diferente'],
        [429, 'Demasiados intentos'],
        [503, 'Mantenimiento'],
      ].map(([k, v]) => [
        k,
        {
          description: v,
          content: { 'application/json': { schema: error, example: { error: v, code: 'POS_ERROR' } } },
        },
      ]),
    )
    const parameters = Object.entries(input.properties ?? {}).map(([name, schema]) => ({
      name,
      in: 'query',
      required: input.required?.includes(name) ?? false,
      schema,
    }))
    const examples: Record<string, unknown> = {
      login: { name: 'Caja principal', password: 'su contraseña' },
      checkout: {
        key: '23a23d95-1745-41cc-bdc9-c074203df039',
        customerId: 1,
        lines: [{ productId: 1, qty: 2, price: 15000 }],
        cash: 10000,
        transfer: 0,
        credit: true,
      },
      payment: {
        key: 'ad4f0d4d-9aa9-4528-a8a7-bf90a016449b',
        customerId: 1,
        amount: 5000,
        method: 'cash',
      },
    }
    ;(paths[r.path] ??= {})[r.verb] = {
      operationId,
      summary: r.summary,
      description:
        'Acceso: ' +
        r.access +
        '. Las listas aceptan los filtros indicados. limit y offset cuentan registros.',
      security: ['public', 'local'].includes(r.access) ? [] : [{ session: [] }],
      ...(r.verb === 'get'
        ? { parameters }
        : {
            requestBody: {
              required: true,
              content: { 'application/json': { schema: input, example: examples[operationId] } },
            },
          }),
      responses: {
        200: {
          description: 'Operación confirmada',
          content: { 'application/json': { schema: output } },
        },
        ...errors,
      },
    }
  }
  paths['/reports.csv'] = {
    get: {
      summary: 'Descargar reporte delimitado para Excel',
      security: [{ session: [] }],
      parameters: (paths['/reports'].get as { parameters: unknown }).parameters,
      responses: {
        200: {
          description: 'CSV UTF-8 con BOM',
          content: { 'text/csv': { schema: { type: 'string' } } },
        },
      },
    },
  }
  return {
    openapi: '3.1.0',
    info: { title: 'Puesto POS', version },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { session: { type: 'apiKey', in: 'cookie', name: 'puesto' } } },
    paths,
  }
}
