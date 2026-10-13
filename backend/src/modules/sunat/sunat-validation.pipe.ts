import { HttpException, HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/**
 * Valida el cuerpo con Zod y responde como apisunat.pe: 422 con el primer
 * problema en `message` y todos, por campo, en `payload`.
 */
@Injectable()
export class SunatValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodType) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fields: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.filter((p) => typeof p !== 'number').join('.') || 'body';
      (fields[path] ??= []).push(issue.message);
    }
    throw new HttpException(
      { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, error: 'Unprocessable Entity', message: result.error.issues[0]?.message ?? 'Los datos enviados no son válidos', payload: fields },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
