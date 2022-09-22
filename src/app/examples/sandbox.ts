import { Injectable } from '@angular/core';
import { InputStream } from '../core/stream';
import { StreamBuilder } from '../core/stream.builder';
import { Example, ExampleSection } from './interface';

@Injectable()
export class SandboxExample implements Example {
  name = 'sandbox';
  section: ExampleSection = 'other';

  constructor(
    protected _streamBuilder: StreamBuilder,
  ) { }

  getSources(): InputStream[] {
    return [this._streamBuilder.inputStream([2, 5, 8], 10)];
  };

  getCode(): string {
    return `function visualize({ of }, { map }, one$) {
  return of(10).pipe(
    map((x) => x * 2),
  );
}`;
  };
}
