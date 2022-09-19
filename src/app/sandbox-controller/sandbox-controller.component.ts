import { BehaviorSubject, combineLatest, merge, Observable, Subject } from 'rxjs';
import { distinctUntilChanged, first, map, takeUntil, tap } from 'rxjs/operators';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { UntypedFormBuilder } from '@angular/forms';
import { getFunctionResult } from '../internal/functions';
import { getFormValue } from '../internal/helpers';
import { InputStream, Stream } from '../internal/stream';
import { StreamBuilder } from '../internal/stream.builder';
import { SandboxService } from '../sandbox.service';

@Component({
  selector: 'app-sandbox-controller',
  templateUrl: './sandbox-controller.component.html',
  styleUrls: ['./sandbox-controller.component.scss']
})
export class SandboxControllerComponent implements OnInit, OnDestroy {
  protected _onDestroySubject$ = new Subject<boolean>();
  protected _sourcesSubject$ = new BehaviorSubject<InputStream[]>(null);
  protected _outputSubject$ = new BehaviorSubject<Stream>(null);

  codeMirrorOptions = {
    lineNumbers: true,
    theme: 'material',
    mode: 'text/typescript'
  };

  formGroup = this._formBuilder.group({ code: [null] });

  sources$ = this._sourcesSubject$.asObservable().pipe(distinctUntilChanged())
  output$ = this._outputSubject$.asObservable().pipe(distinctUntilChanged());
  code$ = this.getFormValue('code');

  constructor(
    protected _sandboxSvc: SandboxService,
    protected _streamBuilder: StreamBuilder,
    protected _formBuilder: UntypedFormBuilder,
  ) { }

  protected getFormValue<T = string>(key: string): Observable<T> {
    return getFormValue<T>(key, this.formGroup);
  }

  protected handleSandboxServiceChanges(): void {
    this._sandboxSvc.exampleToRender$.pipe(
      tap((example) => {
        this._sourcesSubject$.next(example.getSources());
        this.formGroup.get('code').setValue(example.getCode());
      }),
      takeUntil(this._onDestroySubject$),
    ).subscribe()
  }

  protected handleInputChanges(): void {
    merge(this.code$, this.sources$).pipe(
      tap(() => this._outputSubject$.next(null)),
    ).subscribe();
  }

  ngOnInit(): void {
    this.handleInputChanges();
    this.handleSandboxServiceChanges();
  }

  addInputStream(): void {
    this._sourcesSubject$.pipe(
      first(),
      map((sources) => [...sources, this._streamBuilder.inputStream([2, 5, 8], 10)]),
      tap((sources) => this._sourcesSubject$.next(sources)),
    ).subscribe()
  }

  removeInputStream(index: number): void {
    this._sourcesSubject$.pipe(
      first(),
      map((sources) => sources.filter((_, i) => i !== index)),
      tap((sources) => this._sourcesSubject$.next(sources)),
    ).subscribe()
  }

  visualizeOutput(): void {
    combineLatest([this.code$, this.sources$]).pipe(
      first(),
      map(([code, sources]) => ({ code, sources: sources.map((s) => s.source$) })),
      map(({ code, sources }) => getFunctionResult(code, sources)),
      map((output$) => this._streamBuilder.outputStream(output$)),
      tap((stream) => this._outputSubject$.next(stream)),
    ).subscribe();
  }

  ngOnDestroy(): void {
    this._onDestroySubject$.next(true);
  }
}
