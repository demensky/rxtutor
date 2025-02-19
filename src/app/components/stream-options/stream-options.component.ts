import { combineLatest, merge, Observable } from 'rxjs';
import { debounceTime, distinctUntilChanged, first, map, skip, tap, withLatestFrom } from 'rxjs/operators';
import { Component, Inject, Input, OnInit, Optional } from '@angular/core';
import { FormControl, FormGroup, NonNullableFormBuilder, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { UntilDestroy, untilDestroyed } from '@ngneat/until-destroy';
import { getFormValue, InputStream, range, StreamNode } from '../../core';
import { LoggerService } from '../../logger.service';
import { StreamBuilderService } from '../../services';

type CompleteType = 'C' | 'E' | null;

interface StreamUpdate {
  indexes: number[];
  start: string;
  complete: CompleteType;
  terminateIndex: number;
}

interface StreamFormControls {
  size: FormControl<number>;
  start: FormControl<string>;
  type: FormControl<string>;
  complete: FormControl<CompleteType>;
}

interface DialogData {
  stream: InputStream;
}

@Component({
  selector: 'app-stream-options',
  templateUrl: './stream-options.component.html',
  styleUrls: ['./stream-options.component.scss']
})
@UntilDestroy()
export class StreamOptionsComponent implements OnInit {
  @Input() stream: InputStream;

  maxNumberOfNodes = range(Math.floor((this._streamBuilder.defaultCompleteFrame) / 2)).map((x) => x + 1);

  formGroup: FormGroup<StreamFormControls> | undefined;

  size$: Observable<number> | undefined;
  start$: Observable<string> | undefined;
  type$: Observable<string> | undefined;
  complete$: Observable<CompleteType> | undefined;
  startOptions$: Observable<string[]> | undefined;

  constructor(
    @Optional() @Inject(MAT_DIALOG_DATA) data: DialogData | undefined,
    protected _streamBuilder: StreamBuilderService,
    protected _formBuilder: NonNullableFormBuilder,
    protected _logger: LoggerService,
  ) {
    this.stream = data?.stream ?? this._streamBuilder.defaultInputStream();
  }

  protected initFormGroup(nodes: StreamNode[]): void {
    const firstNode = nodes[0];
    const lastNode = nodes[nodes.length - 1];

    const size = nodes.filter((x) => x.kind === 'N').length;
    const start = firstNode.symbol;
    const type = isFinite(+firstNode.symbol) ? 'numeric' : 'alpha';
    const complete = lastNode.kind !== 'N' ? lastNode.kind : null;

    this.formGroup = this._formBuilder.group<StreamFormControls>({
      size: this._formBuilder.control(size, Validators.required),
      start: this._formBuilder.control(start, Validators.required),
      type: this._formBuilder.control(type, Validators.required),
      complete: this._formBuilder.control(complete, Validators.required),
    });

    this.size$ = getFormValue<number>('size', this.formGroup);
    this.start$ = getFormValue('start', this.formGroup);
    this.type$ = getFormValue('type', this.formGroup);
    this.complete$ = getFormValue<CompleteType>('complete', this.formGroup);

    this.startOptions$ = this.type$.pipe(
      map((t) => {
        const n = this.maxNumberOfNodes.length;
        if (t === 'numeric') {
          return range(10 - n).map((x) => `${x + 1}`);
        }

        const startAsc = 'a'.charCodeAt(0);
        return range(n).map((x) => String.fromCharCode(startAsc + x));
      }),
    );
  }

  protected handleFormControlChanges(): void {
    const sizeChange$ = this.size$!.pipe(
      skip(1),
      withLatestFrom(this.start$!, this.complete$!),
      tap(([size, start, complete]) => console.log('sizeChange', { size, start, complete })),
      map(([size, start, complete]): StreamUpdate => ({
        indexes: this._streamBuilder.getDistributedIndexes(size),
        start,
        complete,
        terminateIndex: this._streamBuilder.defaultCompleteFrame,
      })),
    );

    const startOrCompleteChange$ = combineLatest([this.start$!, this.complete$!]).pipe(
      skip(1),
      withLatestFrom(this.stream.next$, this.stream.terminate$),
      tap(([[start, complete], next, terminate]) => console.log('startOrCompleteChange', { start, complete, next, terminate })),
      map(([[start, complete], next, terminate]): StreamUpdate => ({
        indexes: next.map((n) => n.zIndex),
        start,
        complete,
        terminateIndex: terminate?.zIndex ?? this._streamBuilder.defaultCompleteFrame,
      })),
    );

    const adjustStartControlValue$ = this.type$!.pipe(
      skip(1),
      distinctUntilChanged(),
      tap((type) => console.log('adjustStartControlValue', { type })),
      map((type) => type === 'numeric' ? '1' : 'a'),
      tap((start) => this.formGroup!.get('start')?.setValue(start)),
      untilDestroyed(this),
    );

    const adjustStream$ = merge(sizeChange$, startOrCompleteChange$).pipe(
      tap(({ indexes, start, complete, terminateIndex }) => {
        const completeIndex = complete === 'C' ? terminateIndex : null;
        const errorIndex = complete === 'E' ? terminateIndex : null;
        this._streamBuilder.adjustStream(this.stream, indexes, completeIndex, errorIndex, start);
      }),
      untilDestroyed(this),
    );

    adjustStartControlValue$.subscribe();
    adjustStream$.subscribe();
  }

  protected handleStreamChanges(): void {
    const setControlSize$ = this.stream.next$.pipe(
      debounceTime(300),
      map((nodes) => nodes.length),
      distinctUntilChanged(),
      tap((size) => this.formGroup!.get('size')?.setValue(size, { emitEvent: false })),
      untilDestroyed(this),
    );

    setControlSize$.subscribe();
  }

  ngOnInit(): void {
    this.stream.nodes$.pipe(
      first(),
      tap((nodes) => {
        this.initFormGroup(nodes);
        this.handleFormControlChanges();
        this.handleStreamChanges();
      }),
    ).subscribe();
  }
}
